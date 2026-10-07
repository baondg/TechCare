const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const MedicalRecord = require('../models/MedicalRecord');

/** The patient's most recent MEDICAL_RECORD (vital signs snapshot), or null. */
async function findLatestForPatient(patientId) {
  return MedicalRecord.findOne({
    where: { patient_id: patientId },
    order: [['time', 'DESC']],
  });
}

/** @returns {Promise<{ count: number, rows: MedicalRecord[] }>} newest first */
async function listForPatient(patientId, { limit, offset }) {
  return MedicalRecord.findAndCountAll({
    where: { patient_id: patientId },
    order: [['time', 'DESC']],
    limit,
    offset,
  });
}

/** A record only when it belongs to the patient. */
async function findForPatient(id, patientId) {
  return MedicalRecord.findOne({ where: { id, patient_id: patientId } });
}

async function create(values) {
  return MedicalRecord.create(values);
}

/** @param record an instance from this repository */
async function update(record, changes) {
  await record.update(changes);
}

/** @param record an instance from this repository */
async function destroy(record) {
  await record.destroy();
}

/** Deletes the patient's records among `ids`; returns how many were deleted. */
async function destroyForPatient(patientId, ids) {
  return MedicalRecord.destroy({ where: { patient_id: patientId, id: ids } });
}

/** Vital-sign rows (raw columns) of the patient among `ids`, oldest first. */
async function listVitalsByIds(patientId, ids) {
  return sequelize.query(
    `SELECT id, time, \`condition\`, blood_pressure, heart_rate, temperature, weight, respiratory_rate, spo2
     FROM MEDICAL_RECORD
     WHERE patient_id = :patientId AND id IN (:recordIds)
     ORDER BY time ASC`,
    { replacements: { patientId, recordIds: ids }, type: QueryTypes.SELECT }
  );
}

module.exports = { findLatestForPatient, listForPatient, findForPatient, create, update, destroy, destroyForPatient, listVitalsByIds };
