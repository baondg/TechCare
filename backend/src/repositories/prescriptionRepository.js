const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const {
  insertMedicalPrescriptionCompat,
  insertPrescriptionDetailCompat,
  selectMedicalPrescriptionMetaCompat,
  selectPrescriptionRowsWithDurationFallback,
  updateMedicalPrescriptionCompat,
} = require('../common/prescriptionQueryCompat');

/**
 * MEDICAL_PRESCRIPTION (header; `note` holds the JSON meta with the BYT e-prescription fields) and
 * PRESCRIPTION_DETAIL (lines). MEDICAL_PRESCRIPTION.order_id is the ORDER id. Schemas without the
 * `duration` columns are handled by common/prescriptionQueryCompat.
 */

const PRESCRIPTION_ROWS_FROM = `FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`;

const DOCTOR_NAME_SQL = `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName`;

/**
 * One row per prescription line (a prescription without lines gives one row with null line
 * fields), newest prescription first. Legacy schemas give no `prescriptionDuration` / `lineDuration`.
 */
async function listPrescriptionRowsForPatient(patientId) {
  const sqlWithDuration = `SELECT
         rx.order_id,
         rx.time,
         rx.note AS prescriptionNote,
         COALESCE(rx.duration, 7) AS prescriptionDuration,
         d.user_id AS doctorUserId,
         ${DOCTOR_NAME_SQL},
         pd.no AS medNo,
         m.name,
         pd.quantity,
         COALESCE(pd.duration, 7) AS lineDuration,
         pd.usage,
         pd.unit,
         pd.note AS medNote
       ${PRESCRIPTION_ROWS_FROM}`;
  const sqlLegacy = `SELECT
         rx.order_id,
         rx.time,
         rx.note AS prescriptionNote,
         d.user_id AS doctorUserId,
         ${DOCTOR_NAME_SQL},
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.usage,
         pd.unit,
         pd.note AS medNote
       ${PRESCRIPTION_ROWS_FROM}`;
  return selectPrescriptionRowsWithDurationFallback(sequelize, sqlWithDuration, sqlLegacy, { patientId });
}

/** Whether prescription `orderId` belongs to the patient. */
async function prescriptionBelongsToPatient(orderId, patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT rx.order_id
     FROM MEDICAL_PRESCRIPTION rx
     JOIN \`ORDER\` o ON o.id = rx.order_id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE rx.order_id = :orderId AND r.patient_id = :patientId
     LIMIT 1`,
    { replacements: { orderId, patientId }, type: QueryTypes.SELECT, transaction }
  );
  return Boolean(rows[0]);
}

/** Header with `time = NOW()`. */
async function insertPrescription({ orderId, duration, note }, transaction) {
  await insertMedicalPrescriptionCompat(sequelize, { orderId, duration, note, transaction });
}

/** Sets `time = NOW()` and the note; `duration` too unless undefined. */
async function updatePrescription(orderId, { note, duration }, transaction) {
  await updateMedicalPrescriptionCompat(sequelize, { orderId, setNote: note, setDuration: duration, transaction });
}

/** MEDICAL_PRESCRIPTION.note (the JSON meta) of a prescription, or undefined. */
async function findPrescriptionNote(orderId, transaction) {
  const rows = await sequelize.query('SELECT note FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1', {
    replacements: { orderId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.note;
}

/** MEDICAL_PRESCRIPTION.time of a prescription, or undefined. */
async function findPrescriptionTime(orderId, transaction) {
  const rows = await sequelize.query('SELECT time FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1', {
    replacements: { orderId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.time;
}

/** `{ time, duration? }` of a prescription (no duration on legacy schemas), or undefined. */
async function findPrescriptionTimeAndDuration(orderId, transaction) {
  const rows = await selectMedicalPrescriptionMetaCompat(sequelize, { orderId, transaction });
  return rows[0];
}

async function insertPrescriptionLine(line, transaction) {
  await insertPrescriptionDetailCompat(sequelize, { ...line, transaction });
}

async function deletePrescriptionLines(orderId, transaction) {
  await sequelize.query('DELETE FROM PRESCRIPTION_DETAIL WHERE prescription_id = :orderId', {
    replacements: { orderId },
    type: QueryTypes.DELETE,
    transaction,
  });
}

/** Whether a stored prescription meta note already contains this BYT code. */
async function bytCodeInUse(code, transaction) {
  const rows = await sequelize.query(
    `SELECT order_id
     FROM MEDICAL_PRESCRIPTION
     WHERE note LIKE :needle
     LIMIT 1`,
    { replacements: { needle: `%${code}%` }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) }
  );
  return Boolean(rows[0]);
}

// ─── Patient facts printed on a BYT prescription ───

/** `{ dob, idcard, tel }` of the patient's USER, or undefined. */
async function findPatientDemographics(patientId, transaction) {
  const [row] = await sequelize.query(
    `SELECT u.dob, u.idcard, u.tel
     FROM PATIENT p
     JOIN USER u ON u.id = p.user_id
     WHERE p.patient_id = :patientId
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  return row;
}

/** `{ name, tel }` of the patient's first RELATIVE, or null. */
async function findFirstRelative(patientId, transaction) {
  const rows = await sequelize.query('SELECT name, tel FROM RELATIVE WHERE patient_id = :pk LIMIT 1', {
    replacements: { pk: patientId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows?.[0] || null;
}

/** Weight of the patient's latest MEDICAL_RECORD (may be null), or undefined. */
async function findLatestWeight(patientId, transaction) {
  const rows = await sequelize.query(
    'SELECT weight FROM MEDICAL_RECORD WHERE patient_id = :pk ORDER BY time DESC LIMIT 1',
    { replacements: { pk: patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows?.[0]?.weight;
}

module.exports = {
  listPrescriptionRowsForPatient,
  prescriptionBelongsToPatient,
  insertPrescription,
  updatePrescription,
  findPrescriptionNote,
  findPrescriptionTime,
  findPrescriptionTimeAndDuration,
  insertPrescriptionLine,
  deletePrescriptionLines,
  bytCodeInUse,
  findPatientDemographics,
  findFirstRelative,
  findLatestWeight,
};
