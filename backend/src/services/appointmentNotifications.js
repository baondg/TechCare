const { QueryTypes } = require('sequelize');

async function fetchAppointmentSummary(sequelize, appointmentId) {
  const [row] = await sequelize.query(
    `SELECT
       a.id,
       a.patient_id AS patientId,
       a.doctor_id AS doctorId,
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       d.specifications AS department,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorLabel,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.first_name,''),' ',COALESCE(pu.last_name,''))), ''), pacc.username) AS patientLabel
     FROM APPOINTMENT a
     JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     JOIN USER du ON du.id = d.user_id
     LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
     LEFT JOIN ACCOUNT pacc ON pacc.user_id = p.user_id
     LEFT JOIN USER pu ON pu.id = p.user_id
     WHERE a.id = :id LIMIT 1`,
    { replacements: { id: appointmentId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function fetchPatientDisplayName(sequelize, patientId) {
  const [row] = await sequelize.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), acc.username) AS name
     FROM PATIENT p
     JOIN USER u ON u.id = p.user_id
     JOIN ACCOUNT acc ON acc.user_id = p.user_id
     WHERE p.patient_id = :pid LIMIT 1`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
  return row?.name || 'Bệnh nhân';
}

async function doctorUserId(sequelize, doctorId) {
  const [dr] = await sequelize.query(
    'SELECT user_id AS uid FROM DOCTOR WHERE doctor_id = :did LIMIT 1',
    { replacements: { did: doctorId }, type: QueryTypes.SELECT }
  );
  return dr?.uid || null;
}

async function patientUserId(sequelize, pid) {
  const [pr] = await sequelize.query(
    'SELECT user_id AS uid FROM PATIENT WHERE patient_id = :pid LIMIT 1',
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return pr?.uid || null;
}

async function insertNotif(sequelize, userId, type, content) {
  if (!userId) return;
  await sequelize.query(
    `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
     VALUES (:type, :content, NOW(), 'unread', :userId)`,
    { replacements: { type, content, userId }, type: QueryTypes.INSERT }
  );
}

async function safeRun(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[appointment-notify] ${label}:`, e?.message || e);
  }
}

exports.notifyDoctorPatientBooked = (sequelize, appointmentId) =>
  safeRun('notifyDoctorPatientBooked', async () => {
    const s = await fetchAppointmentSummary(sequelize, appointmentId);
    if (!s) return;
    const uid = await doctorUserId(sequelize, s.doctorId);
    const patientName = s.patientLabel || 'Bệnh nhân';
    const dept = s.department ? ` — ${s.department}` : '';
    const content = `${patientName} đã đặt lịch khám với bạn: ${s.dateVi} lúc ${s.timeVi}${dept}.`;
    await insertNotif(sequelize, uid, 'appointment_patient_booked', content);
  });

exports.notifyDoctorPatientCancelledAppointment = (sequelize, appointmentId) =>
  safeRun('notifyDoctorPatientCancelledAppointment', async () => {
    const s = await fetchAppointmentSummary(sequelize, appointmentId);
    if (!s || !s.patientId) return;
    const uid = await doctorUserId(sequelize, s.doctorId);
    const patientName = s.patientLabel || 'Bệnh nhân';
    const dept = s.department ? ` — ${s.department}` : '';
    const content = `${patientName} đã hủy lịch khám: ${s.dateVi} lúc ${s.timeVi}${dept}.`;
    await insertNotif(sequelize, uid, 'appointment_patient_cancelled', content);
  });

/** Bác sĩ Cover / hủy lịch từ portal bác sĩ */
exports.notifyPatientDoctorCover = (sequelize, appointmentId) =>
  safeRun('notifyPatientDoctorCover', async () => {
    const s = await fetchAppointmentSummary(sequelize, appointmentId);
    if (!s || !s.patientId) return;
    const uid = await patientUserId(sequelize, s.patientId);
    const doctorName = s.doctorLabel || 'Bác sĩ';
    const dept = s.department ? ` — ${s.department}` : '';
    const content = `${doctorName} đã hủy buổi hẹn (Cover): ${s.dateVi} lúc ${s.timeVi}${dept}. Vui lòng đặt lịch lại với bác sĩ khác nếu cần.`;
    await insertNotif(sequelize, uid, 'appointment_doctor_cover', content);
  });

/** Y tá đổi lịch trong ngày: thông báo bác sĩ khung cũ và khung mới */
exports.notifyDoctorsAfterNurseReschedule = (sequelize, { fromAppointmentId, toAppointmentId, patientId }) =>
  safeRun('notifyDoctorsAfterNurseReschedule', async () => {
    const patientName = await fetchPatientDisplayName(sequelize, patientId);
    const fromS = await fetchAppointmentSummary(sequelize, fromAppointmentId);
    const toS = await fetchAppointmentSummary(sequelize, toAppointmentId);
    if (fromS) {
      const uid = await doctorUserId(sequelize, fromS.doctorId);
      const dept = fromS.department ? ` — ${fromS.department}` : '';
      const content = `${patientName} đã đổi lịch, không còn hẹn ngày ${fromS.dateVi} lúc ${fromS.timeVi}${dept}.`;
      await insertNotif(sequelize, uid, 'appointment_patient_rescheduled', content);
    }
    if (toS) {
      const uid = await doctorUserId(sequelize, toS.doctorId);
      const dept = toS.department ? ` — ${toS.department}` : '';
      const content = `${patientName} đã được chuyển đến lịch của bạn: ${toS.dateVi} lúc ${toS.timeVi}${dept}.`;
      await insertNotif(sequelize, uid, 'appointment_patient_rescheduled', content);
    }
  });

/**
 * After clinic-room transfer: notify all doctors linked to the destination department
 * (DOCTOR_DEPARTMENT and/or primary room in that department). Message in English.
 */
exports.notifyDepartmentDoctorsInboundClinicTransfer = (sequelize, { toRoomId, patientPk, reason, note }) =>
  safeRun('notifyDepartmentDoctorsInboundClinicTransfer', async () => {
    const [room] = await sequelize.query(
      `SELECT cr.name AS roomName, cr.department_id AS departmentId, dep.name AS departmentName
       FROM CLINIC_ROOM cr
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE cr.id = :id LIMIT 1`,
      { replacements: { id: toRoomId }, type: QueryTypes.SELECT }
    );
    if (!room?.departmentId) {
      console.warn('[transfer-notify] Destination room has no department_id; skipping doctor notifications');
      return;
    }

    const rows = await sequelize.query(
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
      { replacements: { deptId: room.departmentId }, type: QueryTypes.SELECT }
    );

    const [pat] = await sequelize.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), acc.username) AS name
       FROM PATIENT p
       JOIN USER u ON u.id = p.user_id
       JOIN ACCOUNT acc ON acc.user_id = p.user_id
       WHERE p.patient_id = :pid LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
    );
    const patientName = (pat?.name && String(pat.name).trim()) || 'Patient';
    const reasonEn = String(reason || '').trim();
    const noteEn = String(note || '').trim();
    const deptLabel = (room.departmentName && String(room.departmentName).trim()) || 'your department';
    const roomLabel = (room.roomName && String(room.roomName).trim()) || `Room #${toRoomId}`;
    const content =
      `Inbound clinic transfer: patient ${patientName} is being transferred to ${roomLabel} (${deptLabel}). ` +
      `Reason: ${reasonEn || '—'}. ` +
      `Clinical note: ${noteEn || '—'}.`;

    for (const row of rows) {
      if (row.userId) await insertNotif(sequelize, row.userId, 'patient_clinic_transfer_inbound', content);
    }
  });
