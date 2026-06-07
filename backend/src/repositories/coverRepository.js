const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

function qTx(transaction, base) {
  return transaction ? { ...base, transaction } : base;
}

async function selectDoctorInfoByUserId(userId) {
  const rows = await sequelize.query(
    `SELECT d.doctor_id, d.specifications, d.user_id,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), a.username) AS doctorName
     FROM DOCTOR d
     JOIN USER u ON u.id = d.user_id
     JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE d.user_id = :userId
     LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function insertCoverNotification({ userId, title, message, type, relatedId }) {
  const headline = String(title || '').trim();
  const body = String(message || '').trim();
  let content = [headline, body].filter(Boolean).join(': ');
  if (relatedId != null && String(relatedId).trim() !== '') {
    content = content ? `${content} (#${relatedId})` : `#${relatedId}`;
  }
  if (!content) content = headline || body || 'Notification';
  await sequelize.query(
    `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
     VALUES (:type, :content, NOW(), 'unread', :userId)`,
    {
      replacements: { userId, type, content },
      type: QueryTypes.INSERT,
    }
  );
}

async function selectScheduledAppointmentOwnedByDoctor(appointmentId, doctorId) {
  const [appt] = await sequelize.query(
    `SELECT id FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId AND status = 'scheduled' LIMIT 1`,
    { replacements: { id: appointmentId, doctorId }, type: QueryTypes.SELECT }
  );
  return appt || null;
}

async function insertCoverRequest({ doctorId, appointmentId, reason }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO COVER_REQUEST (original_doctor_id, appointment_id, status, reason, created_at)
     VALUES (:doctorId, :appointmentId, 'pending', :reason, NOW())`,
    {
      replacements: { doctorId, appointmentId, reason },
      type: QueryTypes.INSERT,
    }
  );
  return insertId;
}

async function selectDoctorUserIdsBySpecifications(spec, excludeDoctorId) {
  return sequelize.query(
    `SELECT d.user_id
     FROM DOCTOR d
     WHERE d.specifications = :spec AND d.doctor_id != :doctorId`,
    { replacements: { spec, doctorId: excludeDoctorId }, type: QueryTypes.SELECT }
  );
}

async function listPendingCoverRequestsForSpecialty(spec, myDoctorId) {
  return sequelize.query(
    `SELECT
       cr.id,
       cr.appointment_id AS appointmentId,
       cr.status,
       cr.reason,
       cr.created_at AS createdAt,
       DATE(a.time) AS appointmentDate,
       TIME(a.time) AS appointmentTime,
       a.\`condition\` AS appointmentCondition,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(ou.first_name,''), ' ', COALESCE(ou.last_name,''))), ''), oa.username) AS originalDoctorName,
       COALESCE(NULLIF(TRIM(dep_appt.name), ''), NULLIF(TRIM(od.specifications), ''), '') AS department,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.first_name,''), ' ', COALESCE(pu.last_name,''))), ''), 'Patient') AS patientName,
       cr2.name AS roomName
     FROM COVER_REQUEST cr
     JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
     JOIN USER ou ON ou.id = od.user_id
     JOIN ACCOUNT oa ON oa.user_id = od.user_id
     JOIN APPOINTMENT a ON a.id = cr.appointment_id
     LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
     LEFT JOIN USER pu ON pu.id = p.user_id
     LEFT JOIN CLINIC_ROOM cr2 ON cr2.id = a.room_id
     LEFT JOIN DEPARTMENT dep_appt ON dep_appt.id = cr2.department_id
     WHERE cr.status = 'pending'
       AND od.specifications = :spec
       AND cr.original_doctor_id != :myDoctorId
     ORDER BY a.time ASC`,
    { replacements: { spec, myDoctorId }, type: QueryTypes.SELECT }
  );
}

async function listCoverRequestsByOriginalDoctor(doctorId) {
  return sequelize.query(
    `SELECT
       cr.id,
       cr.appointment_id AS appointmentId,
       cr.status,
       cr.reason,
       cr.created_at AS createdAt,
       DATE(a.time) AS appointmentDate,
       TIME(a.time) AS appointmentTime,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(cu.first_name,''), ' ', COALESCE(cu.last_name,''))), ''), 'Pending') AS coverDoctorName
     FROM COVER_REQUEST cr
     JOIN APPOINTMENT a ON a.id = cr.appointment_id
     LEFT JOIN DOCTOR cd ON cd.doctor_id = cr.cover_doctor_id
     LEFT JOIN USER cu ON cu.id = cd.user_id
     WHERE cr.original_doctor_id = :doctorId
     ORDER BY cr.created_at DESC`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
}

async function selectPendingCoverRequestForAccept(coverId, transaction) {
  const [row] = await sequelize.query(
    `SELECT cr.*, od.user_id AS originalDoctorUserId, a.patient_id
     FROM COVER_REQUEST cr
     JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
     JOIN APPOINTMENT a ON a.id = cr.appointment_id
     WHERE cr.id = :id AND cr.status = 'pending'
     LIMIT 1`,
    qTx(transaction, { replacements: { id: coverId }, type: QueryTypes.SELECT })
  );
  return row || null;
}

async function markCoverRequestAccepted(coverId, coverDoctorId, transaction) {
  await sequelize.query(
    `UPDATE COVER_REQUEST SET status = 'accepted', cover_doctor_id = :coverDoctorId, updated_at = NOW()
     WHERE id = :id`,
    qTx(transaction, { replacements: { id: coverId, coverDoctorId }, type: QueryTypes.UPDATE })
  );
}

async function reassignAppointmentDoctor(appointmentId, newDoctorId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT SET doctor_id = :newDoctorId WHERE id = :appointmentId`,
    qTx(transaction, { replacements: { newDoctorId, appointmentId }, type: QueryTypes.UPDATE })
  );
}

async function selectPatientUserIdByPatientPk(patientId, transaction) {
  const [row] = await sequelize.query(
    `SELECT user_id FROM PATIENT WHERE patient_id = :patientId LIMIT 1`,
    qTx(transaction, { replacements: { patientId }, type: QueryTypes.SELECT })
  );
  return row || null;
}

async function selectPendingCoverRequestForReject(coverId) {
  const [row] = await sequelize.query(
    `SELECT cr.*, od.user_id AS originalDoctorUserId
     FROM COVER_REQUEST cr
     JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
     WHERE cr.id = :id AND cr.status = 'pending'
     LIMIT 1`,
    { replacements: { id: coverId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

module.exports = {
  selectDoctorInfoByUserId,
  insertCoverNotification,
  selectScheduledAppointmentOwnedByDoctor,
  insertCoverRequest,
  selectDoctorUserIdsBySpecifications,
  listPendingCoverRequestsForSpecialty,
  listCoverRequestsByOriginalDoctor,
  selectPendingCoverRequestForAccept,
  markCoverRequestAccepted,
  reassignAppointmentDoctor,
  selectPatientUserIdByPatientPk,
  selectPendingCoverRequestForReject,
};
