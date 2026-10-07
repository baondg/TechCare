const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');

async function resolveDoctorDisplayName(req) {
  const { userId, username } = req.user;
  const u = await sequelize.query(
    'SELECT first_name, last_name FROM USER WHERE id = :id LIMIT 1',
    { replacements: { id: userId }, type: QueryTypes.SELECT }
  );
  if (u[0]) {
    const full = `${u[0].first_name || ''} ${u[0].last_name || ''}`.trim();
    if (full) return `Dr. ${full}`;
  }
  if (username) return `Dr. ${username}`;
  return `Doctor #${userId}`;
}

async function getDoctorIdByUserId(userId, transaction) {
  const row = await sequelize.query(
    'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row[0]?.doctor_id || null;
}

/** Scheduled / past appointments — lets technicians attach lab orders before any TREATMENT row exists. */
async function getDoctorIdFromPatientAppointments(patientPk, transaction) {
  const qOpts = { type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) };
  const [sched] = await sequelize.query(
    `SELECT doctor_id AS doctorId FROM APPOINTMENT
     WHERE patient_id = :patientPk AND status = 'scheduled'
     ORDER BY \`time\` DESC LIMIT 1`,
    { ...qOpts, replacements: { patientPk } }
  );
  if (sched?.doctorId != null) return Number(sched.doctorId);
  const [any] = await sequelize.query(
    `SELECT doctor_id AS doctorId FROM APPOINTMENT
     WHERE patient_id = :patientPk
     ORDER BY \`time\` DESC LIMIT 1`,
    { ...qOpts, replacements: { patientPk } }
  );
  return any?.doctorId != null ? Number(any.doctorId) : null;
}

/** Prefer logged-in user's DOCTOR row; else latest treating doctor; else doctor on patient's appointment. */
async function getDoctorIdForUserOrLatestForPatient(userId, patientId, transaction) {
  let doctorId = await getDoctorIdByUserId(userId, transaction);
  if (doctorId) return doctorId;
  const latestDoctor = await sequelize.query(
    `SELECT t.doctor_id
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  if (latestDoctor[0]?.doctor_id) return latestDoctor[0].doctor_id;
  return getDoctorIdFromPatientAppointments(patientId, transaction);
}

const MSG_NO_DOCTOR_OR_PRIOR_TREATMENT =
  'No doctor could be resolved for this lab order: the patient needs a scheduled appointment or a prior visit (treatment), or the action must be done by a user linked to a doctor profile.';

async function getTechnicianIdByUserId(userId, transaction) {
  const row = await sequelize.query(
    'SELECT technician_id FROM TECHNICIAN WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row[0]?.technician_id || null;
}

module.exports = {
  MSG_NO_DOCTOR_OR_PRIOR_TREATMENT,
  getDoctorIdByUserId,
  getDoctorIdForUserOrLatestForPatient,
  getTechnicianIdByUserId,
  resolveDoctorDisplayName,
};
