const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * APPOINTMENT from the assigned doctor's side: their schedule, slots they add, and accept /
 * decline / cancel / hand over (cover) of their own appointments.
 */

/** SQL filter per list status group. */
const STATUS_FILTER_SQL = {
  scheduled: " AND a.status = 'scheduled' ",
  completed: " AND a.status = 'completed' ",
  cancelled: " AND a.status = 'cancelled' ",
};

/**
 * The doctor's appointments, latest first. `effectiveStatus` is 'completed' for a scheduled visit
 * that falls inside a closed REGIMEN (checked out) of that patient on the same day.
 * @param {{ startDate: string|null, endDate: string|null, status: 'scheduled'|'completed'|'cancelled'|null }} filter
 */
async function listForDoctor(doctorId, { startDate, endDate, status }) {
  return sequelize.query(
    `SELECT
       a.id,
       DATE(a.time) AS date,
       TIME(a.time) AS time,
       a.status AS dbStatus,
       CASE
         WHEN a.status IN ('completed', 'cancelled') THEN a.status
         WHEN EXISTS (
           SELECT 1 FROM REGIMEN r
           WHERE r.patient_id = a.patient_id
             AND r.\`end\` IS NOT NULL
             AND DATE(a.time) = DATE(r.start)
             AND a.time >= r.start
             AND a.time <= r.\`end\`
         ) THEN 'completed'
         ELSE a.status
       END AS effectiveStatus,
       COALESCE(a.doctor_confirmed, 1) AS doctorConfirmed,
       a.\`condition\` AS symptoms,
       '' AS notes,
       cr.name AS room,
       COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
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
       AND (:startDate IS NULL OR DATE(a.time) >= :startDate)
       AND (:endDate IS NULL OR DATE(a.time) <= :endDate)
       ${STATUS_FILTER_SQL[status] || ''}
     ORDER BY a.time DESC`,
    { replacements: { doctorId, startDate, endDate }, type: QueryTypes.SELECT }
  );
}

// ─── Cover (hand the slot to another doctor) ───

/** `{ id, patientId, doctorId, roomId, slotTime, status }` of a scheduled appointment of the doctor, or null. */
async function findScheduledOwnedBy(id, doctorId) {
  const [row] = await sequelize.query(
    `SELECT
       a.id,
       a.patient_id AS patientId,
       a.doctor_id AS doctorId,
       a.room_id AS roomId,
       a.time AS slotTime,
       a.status
     FROM APPOINTMENT a
     WHERE a.id = :id AND a.doctor_id = :myDoctorId AND a.status = 'scheduled'
     LIMIT 1`,
    { replacements: { id, myDoctorId: doctorId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** Department of the appointment's clinic room, or null. */
async function findRoomDepartmentId(id) {
  const [row] = await sequelize.query(
    `SELECT cr.department_id AS deptId
     FROM APPOINTMENT a
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     WHERE a.id = :id
     LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row?.deptId != null && Number.isFinite(Number(row.deptId)) ? Number(row.deptId) : null;
}

async function doctorInDepartment(doctorId, deptId) {
  const [row] = await sequelize.query(
    `SELECT 1 AS ok
     FROM DOCTOR_DEPARTMENT
     WHERE doctor_id = :did AND department_id = :deptId
     LIMIT 1`,
    { replacements: { did: doctorId, deptId }, type: QueryTypes.SELECT }
  );
  return Boolean(row);
}

/** Whether `doctorId` has another scheduled appointment at the same time as appointment `id`. */
async function hasOtherScheduledAtSameTime(doctorId, id) {
  const [row] = await sequelize.query(
    `SELECT x.id FROM APPOINTMENT x
     WHERE x.doctor_id = :doctorId
       AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
       AND x.status = 'scheduled'
       AND x.id <> :id
     LIMIT 1`,
    { replacements: { doctorId, id }, type: QueryTypes.SELECT }
  );
  return Boolean(row?.id);
}

/**
 * Whether `doctorId` has any other row (any status) at the same time and room as appointment `id`
 * — reassigning would break UNIQUE(time, doctor_id, room_id).
 */
async function hasOtherRowAtSameTimeAndRoom(doctorId, id) {
  const [row] = await sequelize.query(
    `SELECT x.id FROM APPOINTMENT x
     WHERE x.doctor_id = :doctorId
       AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
       AND x.room_id = (SELECT a3.room_id FROM APPOINTMENT a3 WHERE a3.id = :id LIMIT 1)
       AND x.id <> :id
     LIMIT 1`,
    { replacements: { doctorId, id }, type: QueryTypes.SELECT }
  );
  return Boolean(row?.id);
}

/** `{ dateVi, timeVi, depName }` of the appointment (for notifications), or null. */
async function findSlotLabels(id) {
  const [row] = await sequelize.query(
    `SELECT
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName
     FROM APPOINTMENT a
     JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.id = :id LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row || null;
}

// ─── Accept / decline / cancel ───

/** `{ id, patientPk, dc (doctor_confirmed, null = 1), status }` of the doctor's appointment, or null. */
async function findOwnedBookingState(id, doctorId) {
  const [row] = await sequelize.query(
    `SELECT id, patient_id AS patientPk, COALESCE(doctor_confirmed, 1) AS dc, status
     FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1`,
    { replacements: { id, doctorId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** Booking state plus the labels the decline notice needs, or null. */
async function findOwnedBookingForDecline(id, doctorId) {
  const [row] = await sequelize.query(
    `SELECT
       a.patient_id AS patientPk,
       COALESCE(a.doctor_confirmed, 1) AS dc,
       a.status,
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorNameRaw
     FROM APPOINTMENT a
     JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     JOIN USER du ON du.id = d.user_id
     JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.id = :id AND a.doctor_id = :doctorId
     LIMIT 1`,
    { replacements: { id, doctorId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function cancelWithReason(id, reason) {
  await sequelize.query(`UPDATE APPOINTMENT SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id`, {
    replacements: { id, reason },
    type: QueryTypes.UPDATE,
  });
}

/** Turns a declined request back into an open slot of the doctor, keeping the reason. */
async function reopenDeclinedSlot(id, doctorId, reason) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET patient_id = NULL,
         \`condition\` = 'Open slot',
         doctor_confirmed = 1,
         doctor_decline_reason = :reason
     WHERE id = :id AND doctor_id = :doctorId`,
    { replacements: { id, doctorId, reason }, type: QueryTypes.UPDATE }
  );
}

async function markDoctorConfirmed(id) {
  await sequelize.query(`UPDATE APPOINTMENT SET doctor_confirmed = 1, status = 'scheduled' WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.UPDATE,
  });
}

module.exports = {
  listForDoctor,
  findScheduledOwnedBy,
  findRoomDepartmentId,
  doctorInDepartment,
  hasOtherScheduledAtSameTime,
  hasOtherRowAtSameTimeAndRoom,
  findSlotLabels,
  findOwnedBookingState,
  findOwnedBookingForDecline,
  cancelWithReason,
  reopenDeclinedSlot,
  markDoctorConfirmed,
};
