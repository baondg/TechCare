const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const Patient = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');

/** Adds `transaction` to query options only when there is one. */
const withTx = (transaction, options) => (transaction ? { ...options, transaction } : options);

/** PATIENT.patient_id for a USER.id, or null. */
async function findPatientPkByUserId(userId, transaction) {
  const [row] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1',
    withTx(transaction, { replacements: { n: userId }, type: QueryTypes.SELECT })
  );
  return row?.id != null ? Number(row.id) : null;
}

/** PATIENT.patient_id if that patient exists, or null. */
async function findPatientPk(patientPk, transaction) {
  const [row] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE patient_id = :n LIMIT 1',
    withTx(transaction, { replacements: { n: patientPk }, type: QueryTypes.SELECT })
  );
  return row?.id != null ? Number(row.id) : null;
}

/** USER.id if a patient has that user id, or null. */
async function findPatientUserId(userId, transaction) {
  const [row] = await sequelize.query(
    'SELECT user_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1',
    withTx(transaction, { replacements: { n: userId }, type: QueryTypes.SELECT })
  );
  return row?.id != null ? Number(row.id) : null;
}

/** USER.id of a patient by PATIENT.patient_id, or null. */
async function findUserIdByPatientPk(patientPk, transaction) {
  const [row] = await sequelize.query(
    'SELECT user_id AS id FROM PATIENT WHERE patient_id = :n LIMIT 1',
    withTx(transaction, { replacements: { n: patientPk }, type: QueryTypes.SELECT })
  );
  return row?.id != null ? Number(row.id) : null;
}

/** PATIENT.patient_id where either user_id or patient_id equals `value` (one query), or null. */
async function findPatientPkByUserIdOrPk(value, transaction) {
  const rows = await sequelize.query('SELECT patient_id FROM PATIENT WHERE user_id = :v OR patient_id = :v LIMIT 1', {
    replacements: { v: value },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.patient_id ?? null;
}

/** PATIENT model instance (blood type, allergy / history JSON columns), or null. */
async function findPatientById(patientPk) {
  return Patient.findByPk(patientPk);
}

/** PATIENT model instance of a user, or null. */
async function findPatientByUserId(userId, transaction) {
  return Patient.findOne({ where: { user_id: userId }, transaction });
}

/** PATIENT of a user with blood type, allergy / history columns and all MEDICAL_RECORD rows, or null. */
async function findPatientWithMedicalRecordsByUserId(userId) {
  return Patient.findOne({
    where: { user_id: userId },
    attributes: ['patient_id', 'user_id', 'blood_type', 'allergic_info', 'medical_history'],
    include: [{ model: MedicalRecord, as: 'medicalRecords', order: [['time', 'DESC']] }],
  });
}

/** @param patient an instance from this repository */
async function updatePatient(patient, changes) {
  await patient.update(changes);
}

/** Whether the patient has a REGIMEN without an end (an active visit). */
async function hasOpenRegimen(patientId) {
  const [row] = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :pid AND \`end\` IS NULL
     ORDER BY \`start\` DESC, id DESC
     LIMIT 1`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
  return !!row;
}

module.exports = {
  findPatientPkByUserId,
  findPatientPk,
  findPatientUserId,
  findUserIdByPatientPk,
  findPatientPkByUserIdOrPk,
  findPatientById,
  findPatientByUserId,
  findPatientWithMedicalRecordsByUserId,
  updatePatient,
  hasOpenRegimen,
};
