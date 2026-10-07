const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

// Technician dashboard

/** All lab tests (TEST rows) dated today. */
async function countTestsToday() {
  return sequelize.query(
    `SELECT COUNT(*) AS cnt FROM TEST WHERE DATE(time) = CURDATE()`,
    { type: QueryTypes.SELECT }
  );
}

/** Today's tests assigned to the technician (on the test or one of its procedures). */
async function countTechnicianTestsToday(technicianId) {
  return sequelize.query(
    `SELECT COUNT(DISTINCT tst.id) AS cnt
       FROM TEST tst
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       WHERE DATE(tst.time) = CURDATE()
         AND (tst.technician_id = :tid OR p.technician_id = :tid)`,
    { replacements: { tid: technicianId }, type: QueryTypes.SELECT }
  );
}

/** Today's tests with neither a result nor an attachment yet. */
async function countTestsAwaitingInputToday() {
  return sequelize.query(
    `SELECT COUNT(*) AS cnt
       FROM TEST tst
       WHERE DATE(tst.time) = CURDATE()
         AND (tst.attachment_url IS NULL OR TRIM(COALESCE(tst.attachment_url, '')) = '')
         AND (tst.result IS NULL OR TRIM(COALESCE(tst.result, '')) = '')`,
    { type: QueryTypes.SELECT }
  );
}

/** Today's tests with their patient, newest first (max 12). */
async function listTestQueueToday() {
  return sequelize.query(
    `SELECT
         tst.id AS labId,
         tst.type AS testType,
         tst.time AS testTime,
         tst.result AS labResult,
         tst.attachment_url AS attachmentUrl,
         r.patient_id AS patientId,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           acc.username,
           CONCAT('patient#', r.patient_id)
         ) AS patientName
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       JOIN USER u ON u.id = r.patient_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
       WHERE DATE(tst.time) = CURDATE()
       ORDER BY tst.time DESC
       LIMIT 12`,
    { type: QueryTypes.SELECT }
  );
}

/** Patients with the most recent tests (max 8). */
async function listRecentlyTestedPatients() {
  return sequelize.query(
    `SELECT
         r.patient_id AS patientId,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           acc.username,
           CONCAT('patient#', r.patient_id)
         ) AS patientName,
         MAX(tst.time) AS lastTime
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       JOIN USER u ON u.id = r.patient_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
       GROUP BY r.patient_id, patientName
       ORDER BY lastTime DESC
       LIMIT 8`,
    { type: QueryTypes.SELECT }
  );
}

// Doctor dashboard

/** Today's non-cancelled appointments of the doctor. */
async function countDoctorAppointmentsToday(doctorId) {
  return sequelize.query(
    `SELECT COUNT(*) AS cnt
       FROM APPOINTMENT a
       WHERE a.doctor_id = :doctorId
         AND DATE(a.time) = CURDATE()
         AND a.status <> 'cancelled'`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

/** TREATMENT rows (diagnoses) the doctor recorded today. */
async function countDoctorTreatmentsToday(doctorId) {
  return sequelize.query(
    `SELECT COUNT(*) AS cnt
       FROM TREATMENT t
       WHERE t.doctor_id = :doctorId
         AND DATE(t.time) = CURDATE()`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

/** Distinct prescriptions the doctor wrote today. */
async function countDoctorPrescriptionsToday(doctorId) {
  return sequelize.query(
    `SELECT COUNT(DISTINCT rx.order_id) AS cnt
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       WHERE t.doctor_id = :doctorId
         AND DATE(rx.time) = CURDATE()`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

/** Distinct lab tests ordered by the doctor today. */
async function countDoctorTestsToday(doctorId) {
  return sequelize.query(
    `SELECT COUNT(DISTINCT tst.id) AS cnt
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       WHERE t.doctor_id = :doctorId
         AND DATE(tst.time) = CURDATE()`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

/** Today's non-cancelled appointments with patient, room and department (max 8). */
async function listDoctorScheduleToday(doctorId) {
  return sequelize.query(
    `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status AS dbStatus,
         COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
         cr.name AS room,
         p.patient_id AS patientId,
         p.user_id AS userId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
       FROM APPOINTMENT a
       JOIN PATIENT p ON p.patient_id = a.patient_id
       JOIN USER u ON u.id = p.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.doctor_id = :doctorId
         AND DATE(a.time) = CURDATE()
         AND a.status <> 'cancelled'
       ORDER BY a.time ASC
       LIMIT 8`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

/** The doctor's patients by latest appointment (max 5). */
async function listDoctorRecentPatients(doctorId) {
  return sequelize.query(
    `SELECT DISTINCT
         p.patient_id AS patientId,
         p.user_id AS userId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName,
         MAX(a.time) AS lastTime
       FROM APPOINTMENT a
       JOIN PATIENT p ON p.patient_id = a.patient_id
       JOIN USER u ON u.id = p.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
       WHERE a.doctor_id = :doctorId
       GROUP BY p.patient_id, p.user_id, patientName
       ORDER BY lastTime DESC
       LIMIT 5`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

module.exports = {
  countTestsToday,
  countTechnicianTestsToday,
  countTestsAwaitingInputToday,
  listTestQueueToday,
  listRecentlyTestedPatients,
  countDoctorAppointmentsToday,
  countDoctorTreatmentsToday,
  countDoctorPrescriptionsToday,
  countDoctorTestsToday,
  listDoctorScheduleToday,
  listDoctorRecentPatients,
};
