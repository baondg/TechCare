const dashboardRepository = require('../../repositories/doctorDashboardRepository');
const staffRepository = require('../../repositories/staffRepository');

const EMPTY_DASHBOARD = {
  summary: { appointmentsToday: 0, diagnosesToday: 0, prescriptionsToday: 0, labTestsToday: 0 },
  todaysSchedule: [],
  recentPatients: [],
};

const count = (rows) => Number(rows?.[0]?.cnt || 0);
const hasText = (v) => !!v && String(v).trim().length > 0;

/**
 * Technician home: today's lab queue. The doctor-shaped `summary` keys are reused by the UI:
 * appointmentsToday = tests awaiting input, diagnosesToday = my tests, labTestsToday = all tests.
 */
async function getTechnicianDashboard(userId) {
  const technicianId = await staffRepository.findTechnicianIdByUserId(userId);
  const [allTests, myTests, awaitingInput, queueRows, recentRows] = await Promise.all([
    dashboardRepository.countTestsToday(),
    technicianId ? dashboardRepository.countTechnicianTestsToday(technicianId) : Promise.resolve([{ cnt: 0 }]),
    dashboardRepository.countTestsAwaitingInputToday(),
    dashboardRepository.listTestQueueToday(),
    dashboardRepository.listRecentlyTestedPatients(),
  ]);

  return {
    summary: {
      appointmentsToday: count(awaitingInput),
      diagnosesToday: count(myTests),
      prescriptionsToday: 0,
      labTestsToday: count(allTests),
    },
    todaysSchedule: (queueRows || []).map((r) => {
      const d = r.testTime ? new Date(r.testTime) : null;
      const valid = d && !Number.isNaN(d.getTime());
      return {
        id: Number(r.labId),
        date: valid ? d.toISOString().slice(0, 10) : '',
        time: valid ? d.toTimeString().slice(0, 8) : '',
        department: String(r.testType || ''),
        room: '',
        patientId: Number(r.patientId),
        patientName: String(r.patientName || ''),
        status: hasText(r.attachmentUrl) || hasText(r.labResult) ? 'Done' : 'Pending',
      };
    }),
    recentPatients: (recentRows || []).map((r) => ({
      patientId: Number(r.patientId),
      patientName: String(r.patientName || ''),
      lastTime: r.lastTime,
    })),
  };
}

/** Doctor home: today's counts, schedule and recent patients (all zero without a DOCTOR row). */
async function getDoctorDashboard(userId) {
  const doctorId = await staffRepository.findDoctorIdByUserId(userId);
  if (!doctorId) return EMPTY_DASHBOARD;

  const [appointments, treatments, prescriptions, tests, scheduleRows, recentRows] = await Promise.all([
    dashboardRepository.countDoctorAppointmentsToday(doctorId),
    dashboardRepository.countDoctorTreatmentsToday(doctorId),
    dashboardRepository.countDoctorPrescriptionsToday(doctorId),
    dashboardRepository.countDoctorTestsToday(doctorId),
    dashboardRepository.listDoctorScheduleToday(doctorId),
    dashboardRepository.listDoctorRecentPatients(doctorId),
  ]);
  const uiStatus = (dbStatus) => (dbStatus === 'completed' ? 'Done' : dbStatus === 'cancelled' ? 'Cancelled' : 'Pending');

  return {
    summary: {
      appointmentsToday: count(appointments),
      diagnosesToday: count(treatments),
      prescriptionsToday: count(prescriptions),
      labTestsToday: count(tests),
    },
    todaysSchedule: (scheduleRows || []).map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      department: r.department || '',
      room: r.room || '',
      patientId: Number(r.patientId),
      userId: Number(r.userId),
      patientName: r.patientName,
      status: uiStatus(r.dbStatus),
    })),
    recentPatients: (recentRows || []).map((r) => ({
      patientId: Number(r.patientId),
      userId: Number(r.userId),
      patientName: r.patientName,
      lastTime: r.lastTime,
    })),
  };
}

/** Dashboard for the signed-in doctor, or the lab view for technicians. */
async function getDashboard({ userId, role }) {
  return role === 'technician' ? getTechnicianDashboard(userId) : getDoctorDashboard(userId);
}

module.exports = { getDashboard };
