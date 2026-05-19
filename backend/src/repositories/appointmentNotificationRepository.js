const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

async function selectAppointmentSummaryForNotify(appointmentId) {
  const [row] = await sequelize.query(
    `SELECT
       a.id,
       a.patient_id AS patientId,
       a.doctor_id AS doctorId,
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorLabel,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.first_name,''),' ',COALESCE(pu.last_name,''))), ''), pacc.username) AS patientLabel
     FROM APPOINTMENT a
     JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     JOIN USER du ON du.id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
     LEFT JOIN ACCOUNT pacc ON pacc.user_id = p.user_id
     LEFT JOIN USER pu ON pu.id = p.user_id
     WHERE a.id = :id LIMIT 1`,
    { replacements: { id: appointmentId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function selectPatientDisplayName(patientId) {
  const [row] = await sequelize.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), acc.username) AS name
     FROM PATIENT p
     JOIN USER u ON u.id = p.user_id
     JOIN ACCOUNT acc ON acc.user_id = p.user_id
     WHERE p.patient_id = :pid LIMIT 1`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
  return row?.name || 'Patient';
}

async function selectDoctorUserId(doctorId) {
  const [dr] = await sequelize.query(
    'SELECT user_id AS uid FROM DOCTOR WHERE doctor_id = :did LIMIT 1',
    { replacements: { did: doctorId }, type: QueryTypes.SELECT }
  );
  return dr?.uid || null;
}

async function selectPatientUserId(patientId) {
  const [pr] = await sequelize.query(
    'SELECT user_id AS uid FROM PATIENT WHERE patient_id = :pid LIMIT 1',
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
  return pr?.uid || null;
}

async function insertNotificationForUser(userId, type, content) {
  if (!userId) return;
  await sequelize.query(
    `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
     VALUES (:type, :content, NOW(), 'unread', :userId)`,
    { replacements: { type, content, userId }, type: QueryTypes.INSERT }
  );
}

async function selectRoomDepartmentForTransfer(toRoomId) {
  const [room] = await sequelize.query(
    `SELECT cr.name AS roomName, cr.department_id AS departmentId, dep.name AS departmentName
     FROM CLINIC_ROOM cr
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE cr.id = :id LIMIT 1`,
    { replacements: { id: toRoomId }, type: QueryTypes.SELECT }
  );
  return room || null;
}

async function selectDistinctDoctorUserIdsInDepartment(departmentId) {
  return sequelize.query(
    `SELECT DISTINCT t.user_id AS userId FROM (
       SELECT d.user_id AS user_id
       FROM DOCTOR_DEPARTMENT dd
       INNER JOIN DOCTOR d ON d.doctor_id = dd.doctor_id
       WHERE dd.department_id = :deptId
       UNION
       SELECT d.user_id
       FROM DOCTOR d
       INNER JOIN CLINIC_ROOM cr ON cr.id = d.room_id
       WHERE cr.department_id = :deptId
     ) AS t`,
    { replacements: { deptId: departmentId }, type: QueryTypes.SELECT }
  );
}

async function selectPatientNameForInboundTransfer(patientPk) {
  const [pat] = await sequelize.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), acc.username) AS name
     FROM PATIENT p
     JOIN USER u ON u.id = p.user_id
     JOIN ACCOUNT acc ON acc.user_id = p.user_id
     WHERE p.patient_id = :pid LIMIT 1`,
    { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
  );
  return pat;
}

module.exports = {
  selectAppointmentSummaryForNotify,
  selectPatientDisplayName,
  selectDoctorUserId,
  selectPatientUserId,
  insertNotificationForUser,
  selectRoomDepartmentForTransfer,
  selectDistinctDoctorUserIdsInDepartment,
  selectPatientNameForInboundTransfer,
};
