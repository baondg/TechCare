/**
 * Characterization of the patient-side appointment endpoints whose services still answer
 * `{ status, json }`: feedback, booking catalog, the patient's own appointments (book / reschedule /
 * list / update / cancel, with the list cache and doctor notifications) and portal lab test details.
 * Snapshot captured before those services moved to AppError (G3 step B).
 */
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'appointment-patient-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const PATIENT = as('PAT', 70);
const NURSE = as('NUR', 41);

const ME = [/^SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1$/, [{ patient_id: 7 }]];
const DOCTOR_BY_NAME = [/WHERE a.username = :raw/, [{ doctor_id: 5, username: 'hoa', first_name: 'Hoa', last_name: 'Tran', room_id: 2 }]];
const DOCTOR_BY_ID = [/WHERE d.doctor_id = :id LIMIT 1$/, [{ doctor_id: 6, username: 'an', first_name: 'An', last_name: null, room_id: null }]];
const SUMMARY = [/AS doctorId, DATE_FORMAT\(a.time/, [{ id: 11, patientId: 7, doctorId: 5, dateVi: '01/10/2026', timeVi: '09:30', department: 'Cardiology', doctorLabel: 'Hoa Tran', patientLabel: 'Bao Do' }]];
const DOCTOR_USER = [/^SELECT user_id AS uid FROM DOCTOR/, [{ uid: 21 }]];
const BOOKING = { doctor: 'Dr. Hoa Tran', department: 'Cardiology', date: '2026-10-01', time: '09:30:00.000', symptoms: 'cough' };

const SCENARIOS = [
  // ---- feedback
  ['feedback, mine', 'GET', '/api/appointments/feedback', null, [
    [/FROM FEEDBACK f/, [{ id: '1', userId: null, content: null, type: null, time: '2026-09-01', status: '1', rating: '4', response: null, userName: 'Bao' }, { id: 2, status: 0 }]],
  ], () => PATIENT],
  ['feedback, visible', 'GET', '/api/appointments/feedback/visible', null, [[/FROM FEEDBACK f/, [{ id: 3, status: true, rating: 5 }]]], () => NURSE],
  ['feedback, create without content', 'POST', '/api/appointments/feedback', { content: ' ', rating: 5 }, [], () => PATIENT],
  ['feedback, create with bad rating', 'POST', '/api/appointments/feedback', { content: 'ok', rating: 9 }, [], () => PATIENT],
  ['feedback, create', 'POST', '/api/appointments/feedback', { content: ' Great ', rating: '5', type: ' service ' }, [
    [/^INSERT INTO FEEDBACK/, [31, 1]],
    [/FROM FEEDBACK WHERE id = :id/, [{ id: 31, userId: 70, content: 'Great', type: 'service', time: '2026-10-01', status: 1, rating: 5, response: null }]],
  ], () => PATIENT],
  ['feedback, db down', 'GET', '/api/appointments/feedback', null, [[/FEEDBACK/, dbError]], () => PATIENT],

  // ---- booking catalog
  ['doctors, grouped with departments', 'GET', '/api/appointments/doctors', null, [
    [/FROM DOCTOR d JOIN ACCOUNT a ON a.user_id = d.user_id JOIN USER u ON u.id = d.user_id LEFT JOIN CLINIC_ROOM/, [
      { id: 5, username: 'hoa', firstName: 'Hoa', lastName: 'Tran', specifications: 'Cardio', room: 'R2', deptName: 'Cardiology' },
      { id: '5', username: 'hoa', deptName: ' Internal ' },
      { id: 6, username: 'an', specifications: 'ENT; Pediatrics', room: null, deptName: null },
      { id: 7, username: 'lan', specifications: '', deptName: ' ' },
      { id: 'x', username: 'junk' },
    ]],
  ], () => PATIENT],
  ['clinic rooms', 'GET', '/api/appointments/clinic-rooms', null, [[/FROM CLINIC_ROOM cr LEFT JOIN DEPARTMENT/, [{ id: 2, name: 'R2', capacity: 3, departmentId: 1, departmentName: 'Cardiology' }]]], () => PATIENT],
  ['departments', 'GET', '/api/appointments/departments', null, [[/^SELECT id, name FROM DEPARTMENT ORDER BY name/, [{ id: '1', name: ' Cardiology ' }, { id: 2, name: null }]]], () => PATIENT],
  ['doctors, db down', 'GET', '/api/appointments/doctors', null, [[/FROM DOCTOR d/, dbError]], () => PATIENT],

  // ---- the patient's appointments: list (cached)
  ['my appointments, no patient row', 'GET', '/api/appointments', null, [], () => PATIENT],
  ['my appointments, from the DB (cache miss)', 'GET', '/api/appointments', null, [
    ME,
    [/WHERE a.patient_id = :patientId ORDER BY a.time DESC/, [
      { id: 1, date: '2026-10-01', time: '09:30:00', status: 'scheduled', doctorConfirmed: 0, symptoms: 'cough', doctorName: 'Tran Hoa', doctorSpecialty: 'Cardio', roomName: 'R2', roomDepartment: '' },
      { id: 2, status: 'scheduled', doctorConfirmed: '1', roomDepartment: 'ENT' },
      { id: 3, status: 'completed', doctorConfirmed: 1 },
      { id: 4, status: 'cancelled', doctorConfirmed: 1 },
    ]],
  ], () => PATIENT],
  ['my appointments, cache hit', 'GET', '/api/appointments', null, [ME], (s) => {
    s.cache.set('patient:appointments_list:v1:7', { success: true, appointments: [{ id: 99, cached: true }] });
    return PATIENT;
  }],

  // ---- book / reschedule
  ['book, missing fields', 'POST', '/api/appointments', { department: 'Cardiology', date: '2026-10-01', time: '09:30' }, [], () => PATIENT],
  ['book, no patient row', 'POST', '/api/appointments', BOOKING, [], () => PATIENT],
  ['book, unknown doctor', 'POST', '/api/appointments', BOOKING, [ME], () => PATIENT],
  ['book, doctor by id, no clinic room', 'POST', '/api/appointments', { ...BOOKING, doctor: undefined, doctorId: '6' }, [ME, DOCTOR_BY_ID], () => PATIENT],
  ['book, new appointment in the doctor\'s room', 'POST', '/api/appointments', { ...BOOKING, notes: 'n' }, [
    ME, DOCTOR_BY_NAME, [/^INSERT INTO APPOINTMENT/, [301, 1]], SUMMARY, DOCTOR_USER,
  ], () => PATIENT],
  ['book, open slot in the named room', 'POST', '/api/appointments', { ...BOOKING, room: 'Room R9', symptoms: '' }, [
    ME, DOCTOR_BY_NAME,
    [/^SELECT id FROM CLINIC_ROOM WHERE name = :name/, [{ id: 9 }]],
    [/AND room_id = :roomId AND time = :dt AND status = 'scheduled'/, [{ id: 12 }]],
    [/^SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id/, [{ id: 12, patientId: null }]],
  ], () => PATIENT],
  ['book, slot already taken', 'POST', '/api/appointments', BOOKING, [
    ME, DOCTOR_BY_NAME,
    [/AND room_id = :roomId AND time = :dt AND status = 'scheduled'/, [{ id: 12 }]],
    [/^SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id/, [{ id: 12, patientId: 8 }]],
  ], () => PATIENT],
  ['book, any room when the doctor has none', 'POST', '/api/appointments', { ...BOOKING, doctor: undefined, doctorId: 6 }, [
    ME, DOCTOR_BY_ID, [/^SELECT id FROM CLINIC_ROOM LIMIT 1/, [{ id: 1 }]], [/^INSERT INTO APPOINTMENT/, [302, 1]],
  ], () => PATIENT],
  ['reschedule, source not found', 'POST', '/api/appointments', { ...BOOKING, rescheduleFromAppointmentId: 10 }, [ME], () => PATIENT],
  ['reschedule, same slot', 'POST', '/api/appointments', { ...BOOKING, rescheduleFromId: '12' }, [
    ME,
    [/WHERE id = :fid AND patient_id = :patientId AND status = 'scheduled'/, [{ id: 12, patientId: 7 }]],
    DOCTOR_BY_NAME,
    [/AND room_id = :roomId AND time = :dt AND status = 'scheduled'/, [{ id: 12 }]],
    [/^SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id/, [{ id: 12, patientId: null }]],
  ], () => PATIENT],
  ['reschedule, moved to a new slot', 'POST', '/api/appointments', { ...BOOKING, rescheduleFromAppointmentId: 10 }, [
    ME,
    [/WHERE id = :fid AND patient_id = :patientId AND status = 'scheduled'/, [{ id: 10, patientId: 7 }]],
    DOCTOR_BY_NAME,
    [/^INSERT INTO APPOINTMENT/, [303, 1]],
    SUMMARY, DOCTOR_USER,
  ], (s) => {
    s.cache.set('patient:appointments_list:v1:7', { stale: true });
    return PATIENT;
  }],
  ['book, db down', 'POST', '/api/appointments', BOOKING, [ME, [/FROM DOCTOR d/, dbError]], () => PATIENT],
  ['reschedule, db down rolls back', 'POST', '/api/appointments', { ...BOOKING, rescheduleFromAppointmentId: 10 }, [
    ME, [/WHERE id = :fid/, [{ id: 10 }]], [/FROM DOCTOR d/, dbError],
  ], () => PATIENT],

  // ---- update / cancel
  ['update, bad id', 'PUT', '/api/appointments/abc', { status: 'Cancelled' }, [], () => PATIENT],
  ['update, no patient row', 'PUT', '/api/appointments/11', { status: 'Cancelled' }, [], () => PATIENT],
  ['update, not mine', 'PUT', '/api/appointments/11', { status: 'Cancelled' }, [ME], () => PATIENT],
  ['update, cancel without reason', 'PUT', '/api/appointments/11', { status: 'Cancelled' }, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'scheduled' }]],
  ], () => PATIENT],
  ['update, cancel notifies the doctor', 'PUT', '/api/appointments/11', { status: 'Rejected', reason: ' Busy ' }, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'scheduled' }]], SUMMARY, DOCTOR_USER,
  ], () => PATIENT],
  ['update, cancel an already cancelled one', 'PUT', '/api/appointments/11', { status: 'Cancelled', cancellationReason: 'x' }, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'CANCELLED' }]],
  ], () => PATIENT],
  ['update, same status', 'PUT', '/api/appointments/11', { status: 'Upcoming' }, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'Scheduled' }]],
  ], () => PATIENT],
  ['update, new status', 'PUT', '/api/appointments/11', { status: 'Done' }, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'scheduled' }]],
  ], () => PATIENT],
  ['update, free-text status, no status', 'PUT', '/api/appointments/11', {}, [
    ME, [/SELECT id AS apptId, status AS apptStatus/, [{ apptId: 11, apptStatus: 'scheduled' }]],
  ], () => PATIENT],
  ['delete, no reason', 'DELETE', '/api/appointments/11', {}, [ME], () => PATIENT],
  ['delete, not mine', 'DELETE', '/api/appointments/11', { reason: 'Busy' }, [ME], () => PATIENT],
  ['delete, notifies the doctor', 'DELETE', '/api/appointments/11', { cancellationReason: 'Busy' }, [
    ME, [/^SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id/, [{ id: 11 }]], [/^SELECT status FROM APPOINTMENT/, [{ status: 'scheduled' }]], SUMMARY, DOCTOR_USER,
  ], () => PATIENT],
  ['delete, already cancelled, no patient row', 'DELETE', '/api/appointments/11', { reason: 'Busy' }, [
    [/^SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id/, [{ id: 11 }]], [/^SELECT status FROM APPOINTMENT/, [{ status: 'cancelled' }]],
  ], () => PATIENT],
  ['delete, db down', 'DELETE', '/api/appointments/11', { reason: 'Busy' }, [ME, [/APPOINTMENT/, dbError]], () => PATIENT],

  // ---- portal lab test details
  ['lab details, bad id', 'GET', '/api/appointments/lab-tests/0/details', null, [ME], () => PATIENT],
  ['lab details, no patient row', 'GET', '/api/appointments/lab-tests/701/details', null, [], () => PATIENT],
  ['lab details, not mine', 'GET', '/api/appointments/lab-tests/701/details', null, [ME], () => PATIENT],
  ['lab details', 'GET', '/api/appointments/lab-tests/701/details', null, [
    ME, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]], [/FROM TEST_DETAIL/, [{ testId: 701, no: 1, itemIndex: 'summary', result: 'ok' }]],
  ], () => PATIENT],
];

characterize('patient appointments / feedback / catalog: same DB calls, same answers', SNAPSHOT, SCENARIOS);
