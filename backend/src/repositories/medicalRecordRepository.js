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

module.exports = { findLatestForPatient, listForPatient, findForPatient, create, update, destroy };
