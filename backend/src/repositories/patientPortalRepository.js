const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { selectPrescriptionRowsWithDurationFallback } = require('../common/prescriptionQueryCompat');

/** Match doctor EMR: clinical diagnosis rows only (not Rx/lab/surgery/transfer treatments). */
const SQL_STANDALONE_DIAGNOSIS_ONLY = `
  AND NOT EXISTS (
    SELECT 1 FROM \`ORDER\` o
    WHERE o.treatment_id = t.id
      AND (
        EXISTS (SELECT 1 FROM SURGERY s WHERE s.id = o.id)
        OR EXISTS (SELECT 1 FROM TEST tst WHERE tst.id = o.id)
        OR EXISTS (SELECT 1 FROM MEDICAL_PRESCRIPTION rx WHERE rx.order_id = o.id)
        OR EXISTS (SELECT 1 FROM TRANSFERENCE tf WHERE tf.order_id = o.id)
      )
  )`;

async function listPortalPatientBaseRows() {
  return sequelize.query(
    `SELECT
       u.id AS id,
       a.username AS username,
       u.first_name AS firstName,
       u.last_name AS lastName,
       u.sex AS gender,
       u.dob AS dob,
       COALESCE(
         (
           SELECT dep_t.name
           FROM TREATMENT t
           JOIN REGIMEN r ON r.id = t.regimen_id
           LEFT JOIN DEPARTMENT dep_t ON dep_t.id = t.dept_id
           WHERE r.patient_id = pt.patient_id
             AND t.dept_id IS NOT NULL
           ORDER BY t.time DESC, t.id DESC
           LIMIT 1
         ),
         (
           SELECT dep_a.name
           FROM APPOINTMENT a2
           JOIN CLINIC_ROOM cr2 ON cr2.id = a2.room_id
           LEFT JOIN DEPARTMENT dep_a ON dep_a.id = cr2.department_id
           WHERE a2.patient_id = pt.patient_id
           ORDER BY a2.time DESC, a2.id DESC
           LIMIT 1
         )
       ) AS inDepartment
     FROM PATIENT pt
     LEFT JOIN USER u ON u.id = pt.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = u.id
     WHERE (a.type = 'PAT' OR a.user_id IS NULL)
     ORDER BY pt.patient_id DESC`,
    { type: QueryTypes.SELECT }
  );
}

/** @param {string} idCsv comma-separated numeric patient PKs (caller validates) */
async function listTodayScheduledAppointmentsForPatientIdCsv(idCsv) {
  return sequelize.query(
    `SELECT
       a.patient_id AS patientId,
       a.id AS appointmentId,
       TIME_FORMAT(a.time, '%H:%i') AS timeHm,
       a.regimen_id AS regimenId,
       a.room_id AS roomId,
       COALESCE(cr.name, '') AS roomName,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(du.first_name, ''), ' ', COALESCE(du.last_name, ''))), ''),
         da.username,
         ''
       ) AS appointmentDoctorName
     FROM APPOINTMENT a
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     LEFT JOIN USER du ON du.id = d.user_id
     LEFT JOIN ACCOUNT da ON da.user_id = d.user_id
     WHERE DATE(a.time) = CURDATE()
       AND a.status = 'scheduled'
       AND a.patient_id IN (${idCsv})
     ORDER BY a.patient_id ASC, a.time ASC, a.id ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function selectLatestStandaloneDiagnosisRows(patientPk) {
  return sequelize.query(
    `SELECT
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       t.time AS visitTime,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name, ''), ' ', COALESCE(du.last_name, ''))), ''), da.username, CONCAT('doctor#', d.user_id)) AS doctorName
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN USER du ON du.id = d.user_id
     LEFT JOIN ACCOUNT da ON da.user_id = d.user_id
     WHERE r.patient_id = :patientPk
     ${SQL_STANDALONE_DIAGNOSIS_ONLY}
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
}

async function selectPatientDashboardBundle(patientId) {
  return Promise.all([
    sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
         cr.name AS room,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT acc ON acc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.patient_id = :patientId
         AND a.status = 'scheduled'
         AND COALESCE(a.doctor_confirmed, 1) = 1
         AND a.time >= NOW()
       ORDER BY a.time ASC
       LIMIT 1`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT dis.icd_code AS icd10, dis.description AS interpretation
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DISEASE dis ON dis.id = r.disease_id
       WHERE r.patient_id = :patientId
       ORDER BY t.time DESC
       LIMIT 1`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(DISTINCT rx.order_id) AS cnt
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE r.patient_id = :patientId`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(DISTINCT tst.id) AS cnt
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE r.patient_id = :patientId`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    selectPrescriptionRowsWithDurationFallback(
      sequelize,
      `SELECT
         rx.order_id,
         rx.time,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           acc.username,
           CONCAT('doctor#', doc.user_id)
         ) AS doctorName,
         pd.no,
         m.name,
         pd.\`usage\` AS frequency,
         pd.quantity,
         COALESCE(pd.duration, 7) AS lineDuration
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR doc ON doc.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = doc.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = doc.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`,
      `SELECT
         rx.order_id,
         rx.time,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           acc.username,
           CONCAT('doctor#', doc.user_id)
         ) AS doctorName,
         pd.no,
         m.name,
         pd.\`usage\` AS frequency,
         pd.quantity
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR doc ON doc.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = doc.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = doc.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`,
      { patientId }
    ),
    sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status,
         COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
         cr.name AS room,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT acc ON acc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.patient_id = :patientId
         AND a.status = 'scheduled'
         AND COALESCE(a.doctor_confirmed, 1) = 1
         AND a.time >= NOW()
       ORDER BY a.time ASC
       LIMIT 5`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
  ]);
}

async function selectMedicalVisitsBundle(patientId) {
  return Promise.all([
    sequelize.query(
      `SELECT
         t.id AS treatmentId,
         t.time AS visitAt,
         t.type AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         cr.name AS roomName
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DISEASE dis ON dis.id = r.disease_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
       WHERE r.patient_id = :patientId
       ORDER BY t.time DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    selectPrescriptionRowsWithDurationFallback(
      sequelize,
      `SELECT
         o.treatment_id AS treatmentId,
         rx.order_id AS orderId,
         rx.time AS prescribedAt,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.\`usage\` AS frequency,
         pd.unit,
         COALESCE(pd.duration, 7) AS lineDuration
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`,
      `SELECT
         o.treatment_id AS treatmentId,
         rx.order_id AS orderId,
         rx.time AS prescribedAt,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.\`usage\` AS frequency,
         pd.unit
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`,
      { patientId }
    ),
    sequelize.query(
      `SELECT
         o.treatment_id AS treatmentId,
         tst.id AS testId,
         tst.time AS testAt,
         tst.type AS testType,
         tst.result AS resultSummary,
         tst.note,
         tst.attachment_url AS fileUrl,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           a.username
         ) AS technicianName
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
       LEFT JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       WHERE r.patient_id = :patientId
       ORDER BY tst.time DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         o.treatment_id AS treatmentId,
         s.id AS orderId,
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
       WHERE r.patient_id = :patientId
       ORDER BY s.start DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    listMedicalRecordsForPatient(patientId),
  ]);
}

async function listMedicalRecordsForPatient(patientId) {
  return sequelize.query(
    `SELECT id, time, \`condition\`, weight, height, blood_pressure, heart_rate, temperature, spo2, respiratory_rate, status
     FROM MEDICAL_RECORD
     WHERE patient_id = :patientId
     ORDER BY time DESC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

async function listCompletedRegimensForPatient(patientId) {
  return sequelize.query(
    `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
            d.icd_code AS icd10, d.description AS diseaseDescription
     FROM REGIMEN r
     LEFT JOIN DISEASE d ON d.id = r.disease_id
     WHERE r.patient_id = :patientId AND r.end IS NOT NULL
     ORDER BY r.start DESC, r.id DESC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

async function listHospitalTransfersForRegimenIdCsv(idCsv) {
  return sequelize.query(
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
     WHERE t.regimen_id IN (${idCsv})
     ORDER BY tr.time ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function listHealthTrackingSlipsForRegimenIdCsv(idCsv) {
  return sequelize.query(
    `SELECT
       t.regimen_id AS regimenId,
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
     WHERE t.regimen_id IN (${idCsv})
       AND p.type = 'HEALTH_TRACKING_SLIP'
     ORDER BY t.time ASC, o.id ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function listFollowUpReexamSlipsForRegimenIdCsv(idCsv) {
  return sequelize.query(
    `SELECT
       t.regimen_id AS regimenId,
       o.id AS orderId,
       t.time AS createdAt,
       p.note AS payload
     FROM TREATMENT t
     JOIN \`ORDER\` o ON o.treatment_id = t.id
     JOIN PROCEDURE_ p ON p.order_id = o.id
     WHERE t.regimen_id IN (${idCsv})
       AND p.type = 'FOLLOW_UP_REEXAM_SLIP'
     ORDER BY t.time ASC, o.id ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function selectRegimenDetailBundle(patientId, idCsv) {
  return Promise.all([
    sequelize.query(
      `SELECT
         t.id AS treatmentId,
         t.regimen_id AS regimenId,
         t.time AS visitAt,
         t.type AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         cr.name AS roomName
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DISEASE dis ON dis.id = r.disease_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
       WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
       ORDER BY t.time ASC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    selectPrescriptionRowsWithDurationFallback(
      sequelize,
      `SELECT
         o.treatment_id AS treatmentId,
         rx.order_id AS orderId,
         rx.time AS prescribedAt,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.\`usage\` AS frequency,
         pd.unit,
         COALESCE(pd.duration, 7) AS lineDuration
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
       ORDER BY rx.time DESC, pd.no ASC`,
      `SELECT
         o.treatment_id AS treatmentId,
         rx.order_id AS orderId,
         rx.time AS prescribedAt,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.\`usage\` AS frequency,
         pd.unit
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
       ORDER BY rx.time DESC, pd.no ASC`,
      { patientId }
    ),
    sequelize.query(
      `SELECT
         o.treatment_id AS treatmentId,
         tst.id AS testId,
         tst.time AS testAt,
         tst.type AS testType,
         tst.result AS resultSummary,
         tst.note,
         tst.attachment_url AS fileUrl,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           a.username
         ) AS technicianName
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
       LEFT JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
       ORDER BY tst.time DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         o.treatment_id AS treatmentId,
         s.id AS orderId,
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
       WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
       ORDER BY s.start DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ),
    listMedicalRecordsForPatient(patientId),
  ]);
}

async function listSymptomLogsForPatientLimited(patientId) {
  return sequelize.query(
    `SELECT id, time, disease, suggestion FROM SYMPTOM_LOG WHERE patient_id = :patientId ORDER BY time DESC LIMIT 200`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

async function selectLabTestIdIfPatientOwns(testId, patientId) {
  return sequelize.query(
    `SELECT tst.id
     FROM TEST tst
     JOIN \`ORDER\` o ON o.id = tst.id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE tst.id = :id AND r.patient_id = :patientId
     LIMIT 1`,
    { replacements: { id: testId, patientId }, type: QueryTypes.SELECT }
  );
}

async function listTestDetailsForTest(testId) {
  return sequelize.query(
    `SELECT
       test_id AS testId,
       no,
       \`index\` AS itemIndex,
       result,
       unit
     FROM TEST_DETAIL
     WHERE test_id = :testId
     ORDER BY no ASC`,
    { replacements: { testId }, type: QueryTypes.SELECT }
  );
}

module.exports = {
  listPortalPatientBaseRows,
  listTodayScheduledAppointmentsForPatientIdCsv,
  selectLatestStandaloneDiagnosisRows,
  selectPatientDashboardBundle,
  selectMedicalVisitsBundle,
  listCompletedRegimensForPatient,
  listHospitalTransfersForRegimenIdCsv,
  listHealthTrackingSlipsForRegimenIdCsv,
  listFollowUpReexamSlipsForRegimenIdCsv,
  selectRegimenDetailBundle,
  listSymptomLogsForPatientLimited,
  selectLabTestIdIfPatientOwns,
  listTestDetailsForTest,
};
