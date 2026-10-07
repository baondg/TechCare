const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** Adds `transaction` to query options only when there is one. */
const withTx = (transaction, options) => (transaction ? { ...options, transaction } : options);

/** DOCTOR.doctor_id of a user, or null. */
async function findDoctorIdByUserId(userId, transaction) {
  const rows = await sequelize.query('SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1', {
    replacements: { userId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.doctor_id || null;
}

/** TECHNICIAN.technician_id of a user, or null. */
async function findTechnicianIdByUserId(userId, transaction) {
  const rows = await sequelize.query('SELECT technician_id FROM TECHNICIAN WHERE user_id = :userId LIMIT 1', {
    replacements: { userId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.technician_id ?? null;
}

/** @returns {Promise<{ first_name, last_name } | null>} */
async function findUserName(userId) {
  const rows = await sequelize.query('SELECT first_name, last_name FROM USER WHERE id = :id LIMIT 1', {
    replacements: { id: userId },
    type: QueryTypes.SELECT,
  });
  return rows[0] || null;
}

/** Doctor of the patient's most recent TREATMENT, or null. */
async function findLatestTreatingDoctorId(patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT t.doctor_id
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.doctor_id || null;
}

/** Doctor of the patient's latest appointment (only `scheduled` ones with `scheduledOnly`), or null. */
async function findAppointmentDoctorId(patientPk, { scheduledOnly }, transaction) {
  const [row] = await sequelize.query(
    `SELECT doctor_id AS doctorId FROM APPOINTMENT
     WHERE patient_id = :patientPk${scheduledOnly ? " AND status = 'scheduled'" : ''}
     ORDER BY \`time\` DESC LIMIT 1`,
    withTx(transaction, { type: QueryTypes.SELECT, replacements: { patientPk } })
  );
  return row?.doctorId != null ? Number(row.doctorId) : null;
}

/** Stored (encrypted) signature of a doctor, or null. */
async function findDoctorSignature(doctorId) {
  const [row] = await sequelize.query('SELECT signature FROM DOCTOR WHERE doctor_id = :doctorId LIMIT 1', {
    replacements: { doctorId },
    type: QueryTypes.SELECT,
  });
  return row?.signature || null;
}

async function updateDoctorSignature(doctorId, signature) {
  await sequelize.query('UPDATE DOCTOR SET signature = :signature WHERE doctor_id = :doctorId', {
    replacements: { signature, doctorId },
    type: QueryTypes.UPDATE,
  });
}

module.exports = {
  findDoctorIdByUserId,
  findTechnicianIdByUserId,
  findUserName,
  findLatestTreatingDoctorId,
  findAppointmentDoctorId,
  findDoctorSignature,
  updateDoctorSignature,
};
