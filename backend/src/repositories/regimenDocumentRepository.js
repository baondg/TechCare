const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { selectPrescriptionRowsWithDurationFallback } = require('../common/prescriptionQueryCompat');
const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS } = require('./treatmentRepository');

/**
 * Everything recorded during given visits (REGIMEN ids) of a patient: treatments, diagnoses,
 * prescriptions, lab tests, surgeries, hospital transfers and the slips stored on PROCEDURE_.
 * Each order-type row carries the `treatmentId` it hangs off.
 */

const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const DOCTOR_NAME = `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id))`;
const TECHNICIAN_NAME = `COALESCE(
  NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
  a.username
)`;

/** TREATMENT rows with the visit's disease, doctor and room, oldest first. */
async function listTreatments(patientId, regimenIds) {
  return select(
    `SELECT
       t.id AS treatmentId,
       t.regimen_id AS regimenId,
       t.time AS visitAt,
       t.type AS department,
       t.\`condition\` AS complaint,
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       ${DOCTOR_NAME} AS doctorName,
       cr.name AS roomName
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN \`USER\` u ON u.id = d.user_id
     LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
     WHERE r.patient_id = :patientId AND r.id IN (:regimenIds)
     ORDER BY t.time ASC`,
    { patientId, regimenIds }
  );
}

/** Standalone diagnoses (TREATMENT rows that are not an order's document), newest first. */
async function listDiagnoses(patientId, regimenIds) {
  return select(
    `SELECT
       t.id AS id,
       t.time AS diagnosedAt,
       t.\`condition\` AS complaint,
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       COALESCE(NULLIF(TRIM(dep_dx.name), ''), '') AS department
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DEPARTMENT dep_dx ON dep_dx.id = t.dept_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     WHERE r.patient_id = :patientId
       AND r.id IN (:regimenIds)
       ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
     ORDER BY t.time DESC`,
    { patientId, regimenIds }
  );
}

const PRESCRIPTION_FROM = `FROM MEDICAL_PRESCRIPTION rx
     JOIN \`ORDER\` o ON o.id = rx.order_id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
     LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
     WHERE r.patient_id = :patientId AND r.id IN (:regimenIds)
     ORDER BY rx.time DESC, pd.no ASC`;

/**
 * One row per prescription line (null line fields for a prescription without lines), newest first.
 * Legacy schemas give no `prescriptionDuration` / `lineDuration`.
 */
async function listPrescriptionRows(patientId, regimenIds) {
  return selectPrescriptionRowsWithDurationFallback(
    sequelize,
    `SELECT
       o.treatment_id AS treatmentId,
       rx.order_id AS orderId,
       rx.time AS prescribedAt,
       rx.note AS prescriptionNote,
       COALESCE(rx.duration, 7) AS prescriptionDuration,
       pd.no AS medNo,
       m.name,
       pd.quantity,
       pd.\`usage\` AS usageText,
       pd.unit,
       pd.note AS medNote,
       COALESCE(pd.duration, 7) AS lineDuration
     ${PRESCRIPTION_FROM}`,
    `SELECT
       o.treatment_id AS treatmentId,
       rx.order_id AS orderId,
       rx.time AS prescribedAt,
       rx.note AS prescriptionNote,
       pd.no AS medNo,
       m.name,
       pd.quantity,
       pd.\`usage\` AS usageText,
       pd.unit,
       pd.note AS medNote
     ${PRESCRIPTION_FROM}`,
    { patientId, regimenIds }
  );
}

/** Lab tests with the technician's name, newest first. */
async function listLabTests(patientId, regimenIds) {
  return select(
    `SELECT
       o.treatment_id AS treatmentId,
       tst.id AS id,
       tst.time AS testAt,
       tst.type AS testType,
       tst.result AS resultSummary,
       tst.note,
       tst.attachment_url AS fileUrl,
       ${TECHNICIAN_NAME} AS technicianName
     FROM TEST tst
     JOIN \`ORDER\` o ON o.id = tst.id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
     LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
     LEFT JOIN \`USER\` u ON u.id = te.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
     WHERE r.patient_id = :patientId AND r.id IN (:regimenIds)
     ORDER BY tst.time DESC`,
    { patientId, regimenIds }
  );
}

/** Surgeries, latest start first. */
async function listSurgeries(patientId, regimenIds) {
  return select(
    `SELECT
       o.treatment_id AS treatmentId,
       s.id AS id,
       s.type AS surgeryType,
       s.start,
       s.end,
       s.result,
       s.surgeon,
       s.note,
       s.urgency
     FROM SURGERY s
     JOIN PROCEDURE_ pr ON pr.order_id = s.id
     JOIN \`ORDER\` o ON o.id = pr.order_id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId AND r.id IN (:regimenIds)
     ORDER BY s.start DESC`,
    { patientId, regimenIds }
  );
}

/** Transfers to another hospital (with the visit's `regimenId`), oldest first. */
async function listHospitalTransfers(regimenIds) {
  return select(
    `SELECT t.regimen_id AS regimenId,
            tr.order_id AS orderId,
            tr.reason,
            tr.time AS transferAt,
            tr.note,
            ht.to_id AS toHospitalId,
            ht.to_name AS toHospitalName,
            ht.transport,
            ht.form_payload AS formPayload
     FROM TREATMENT t
     JOIN \`ORDER\` o ON o.treatment_id = t.id
     JOIN TRANSFERENCE tr ON tr.order_id = o.id
     INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
     WHERE t.regimen_id IN (:regimenIds)
     ORDER BY tr.time ASC`,
    { regimenIds }
  );
}

/** Health tracking slips (`payload` = PROCEDURE_.note JSON) with the doctor who made them, oldest first. */
async function listHealthTrackingSlips(regimenIds) {
  return select(
    `SELECT
       o.id AS orderId,
       t.time AS createdAt,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
         acc.username,
         NULL
       ) AS createdByDoctor,
       p.note AS payload
     FROM TREATMENT t
     JOIN \`ORDER\` o ON o.treatment_id = t.id
     JOIN PROCEDURE_ p ON p.order_id = o.id
     LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
     LEFT JOIN \`USER\` u ON u.id = d.user_id
     LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
     WHERE t.regimen_id IN (:regimenIds)
       AND p.type = 'HEALTH_TRACKING_SLIP'
     ORDER BY t.time ASC, o.id ASC`,
    { regimenIds }
  );
}

/** Follow-up re-exam slips (`payload` = PROCEDURE_.note JSON), oldest first. */
async function listFollowUpReexamSlips(regimenIds) {
  return select(
    `SELECT
       o.id AS orderId,
       t.time AS createdAt,
       p.note AS payload
     FROM TREATMENT t
     JOIN \`ORDER\` o ON o.treatment_id = t.id
     JOIN PROCEDURE_ p ON p.order_id = o.id
     WHERE t.regimen_id IN (:regimenIds)
       AND p.type = 'FOLLOW_UP_REEXAM_SLIP'
     ORDER BY t.time ASC, o.id ASC`,
    { regimenIds }
  );
}

module.exports = {
  listTreatments,
  listDiagnoses,
  listPrescriptionRows,
  listLabTests,
  listSurgeries,
  listHospitalTransfers,
  listHealthTrackingSlips,
  listFollowUpReexamSlips,
};
