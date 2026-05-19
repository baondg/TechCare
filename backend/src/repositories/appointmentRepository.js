const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

function normalizeDoctorInput(value) {
  return String(value || '').replace(/^Dr\.\s*/i, '').trim();
}

function qWithTx(transaction, base) {
  if (transaction) return { ...base, transaction };
  return base;
}

async function findPatientIdByUserId(userId) {
  const rows = await sequelize.query(
    'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0]?.patient_id ?? null;
}

/** Staff EMR routes: numeric id may be PATIENT.patient_id or PATIENT.user_id. */
async function findPatientPkByRouteId(routeId) {
  const rid = Number(routeId);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const rows = await sequelize.query(
    'SELECT patient_id FROM PATIENT WHERE patient_id = :rid OR user_id = :rid LIMIT 1',
    { replacements: { rid }, type: QueryTypes.SELECT }
  );
  return rows[0]?.patient_id != null ? Number(rows[0].patient_id) : null;
}

async function findRescheduleSourceAppointment(rescheduleFrom, patientId, transaction) {
  const [fc] = await sequelize.query(
    `SELECT id, patient_id AS patientId FROM APPOINTMENT
     WHERE id = :fid AND patient_id = :patientId AND status = 'scheduled' LIMIT 1`,
    qWithTx(transaction, { replacements: { fid: rescheduleFrom, patientId }, type: QueryTypes.SELECT })
  );
  return fc || null;
}

async function findDoctorByDisplayInput(doctorInput) {
  const normalized = normalizeDoctorInput(doctorInput);
  const rows = await sequelize.query(
    `SELECT d.doctor_id, a.username, u.first_name, u.last_name, d.room_id
     FROM DOCTOR d
     JOIN ACCOUNT a ON a.user_id = d.user_id
     JOIN USER u ON u.id = d.user_id
     WHERE a.username = :raw
        OR a.username = :normalized
        OR TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) = :normalized
        OR TRIM(CONCAT(COALESCE(u.last_name,''), ' ', COALESCE(u.first_name,''))) = :normalized
     LIMIT 1`,
    {
      replacements: { raw: String(doctorInput || '').trim(), normalized },
      type: QueryTypes.SELECT,
    }
  );
  return rows[0] || null;
}

async function findDoctorByPrimaryKey(doctorPk) {
  const id = Number(doctorPk);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = await sequelize.query(
    `SELECT d.doctor_id, a.username, u.first_name, u.last_name, d.room_id
     FROM DOCTOR d
     JOIN ACCOUNT a ON a.user_id = d.user_id
     JOIN USER u ON u.id = d.user_id
     WHERE d.doctor_id = :id
     LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function findClinicRoomIdByName(roomName, transaction) {
  const rows = await sequelize.query(
    'SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1',
    qWithTx(transaction, { replacements: { name: roomName }, type: QueryTypes.SELECT })
  );
  return rows[0]?.id ?? null;
}

async function findAnyClinicRoomId(transaction) {
  const rows = await sequelize.query(
    'SELECT id FROM CLINIC_ROOM LIMIT 1',
    qWithTx(transaction, { type: QueryTypes.SELECT })
  );
  return rows[0]?.id ?? null;
}

async function findScheduledSlotAtDoctorRoomTime(doctorId, roomId, dateTime, transaction) {
  const rows = await sequelize.query(
    `SELECT id FROM APPOINTMENT
     WHERE doctor_id = :doctorId AND room_id = :roomId AND time = :dt AND status = 'scheduled'
     LIMIT 1`,
    qWithTx(transaction, {
      replacements: { doctorId, roomId, dt: dateTime },
      type: QueryTypes.SELECT,
    })
  );
  return rows[0] || null;
}

async function getAppointmentPatientId(appointmentId, transaction) {
  const rows = await sequelize.query(
    'SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id LIMIT 1',
    qWithTx(transaction, { replacements: { id: appointmentId }, type: QueryTypes.SELECT })
  );
  return rows[0] || null;
}

async function bookPatientOnAppointment(appointmentId, patientId, condition, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled', doctor_confirmed = 0
     WHERE id = :id`,
    qWithTx(transaction, {
      replacements: { id: appointmentId, patientId, condition },
      type: QueryTypes.UPDATE,
    })
  );
}

async function insertAppointmentRow({ time, condition, patientId, doctorId, roomId }, transaction) {
  const [newId] = await sequelize.query(
    `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
     VALUES (:time, 'scheduled', :condition, :patientId, :doctorId, :roomId, NULL, 0)`,
    qWithTx(transaction, {
      replacements: { time, condition, patientId, doctorId, roomId },
      type: QueryTypes.INSERT,
    })
  );
  return newId;
}

async function releaseRescheduleSourceAppointment(fromId, patientId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT SET patient_id = NULL, \`condition\` = 'Open slot', doctor_confirmed = 1
     WHERE id = :fid AND patient_id = :patientId`,
    qWithTx(transaction, {
      replacements: { fid: fromId, patientId },
      type: QueryTypes.UPDATE,
    })
  );
}

async function listPatientAppointmentsForPortal(patientId) {
  return sequelize.query(
    `SELECT
       a.id,
       DATE(a.time) AS date,
       TIME(a.time) AS time,
       a.status,
       COALESCE(a.doctor_confirmed, 1) AS doctorConfirmed,
       a.\`condition\` AS symptoms,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name,''), ' ', COALESCE(u.first_name,''))), ''), acc.username, '') AS doctorName,
       COALESCE(d.specifications, '') AS doctorSpecialty,
       COALESCE(cr.name, '') AS roomName,
       COALESCE(dep.name, '') AS roomDepartment
     FROM APPOINTMENT a
     LEFT JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     LEFT JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.patient_id = :patientId
     ORDER BY a.time DESC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

async function findPatientAppointmentSummary(apptId, patientId) {
  const [row] = await sequelize.query(
    `SELECT id AS apptId, status AS apptStatus
     FROM APPOINTMENT
     WHERE id = :apptId AND patient_id = :patientId
     LIMIT 1`,
    { replacements: { apptId, patientId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function setAppointmentCancelledWithReason(appointmentId, patientId, reason) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET status = 'cancelled', cancellation_reason = :reason
     WHERE id = :id AND patient_id = :patientId`,
    { replacements: { id: appointmentId, patientId, reason }, type: QueryTypes.UPDATE }
  );
}

async function setAppointmentStatusIfDifferent(appointmentId, patientId, status) {
  await sequelize.query(
    'UPDATE APPOINTMENT SET status = :status WHERE id = :id AND patient_id = :patientId AND status <> :status',
    { replacements: { id: appointmentId, patientId, status }, type: QueryTypes.UPDATE }
  );
}

async function findOwnedAppointmentId(appointmentId, patientId) {
  const rows = await sequelize.query(
    'SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
    { replacements: { id: appointmentId, patientId }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function getAppointmentStatusForPatient(appointmentId, patientId) {
  const [row] = await sequelize.query(
    'SELECT status FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
    { replacements: { id: appointmentId, patientId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function cancelAppointmentByPatient(appointmentId, reason) {
  await sequelize.query(
    "UPDATE APPOINTMENT SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id",
    { replacements: { id: appointmentId, reason }, type: QueryTypes.UPDATE }
  );
}

async function doctorsShareDepartment(doctorIdA, doctorIdB, transaction) {
  if (!doctorIdA || !doctorIdB || Number(doctorIdA) === Number(doctorIdB)) return true;
  const qo = {
    replacements: { a: doctorIdA, b: doctorIdB },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {}),
  };
  const [row] = await sequelize.query(
    `SELECT 1 AS ok
     FROM DOCTOR_DEPARTMENT dd1
     INNER JOIN DOCTOR_DEPARTMENT dd2 ON dd1.department_id = dd2.department_id
     WHERE dd1.doctor_id = :a AND dd2.doctor_id = :b
     LIMIT 1`,
    qo
  );
  return !!row;
}

async function listBookedSlotsForDate(date) {
  return sequelize.query(
    `SELECT
       TIME(a.time) AS time,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
     FROM APPOINTMENT a
     JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     JOIN ACCOUNT acc ON acc.user_id = d.user_id
     JOIN USER u ON u.id = d.user_id
     WHERE DATE(a.time) = :date AND a.status = 'scheduled'`,
    { replacements: { date }, type: QueryTypes.SELECT }
  );
}

async function listOpenSlotsInRange({ hasStart, hasEnd, startDate, endDate, isPatientView }) {
  return sequelize.query(
    `SELECT
       a.id,
       DATE(a.time) AS date,
       TIME(a.time) AS time,
       a.status AS dbStatus,
       a.patient_id AS patientId,
       p.user_id AS patientUserId,
       d.doctor_id AS doctorId,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.last_name,''), ' ', COALESCE(du.first_name,''))), ''), dacc.username) AS doctorName,
       COALESCE(
         NULLIF(TRIM(dep_room.name), ''),
         (SELECT NULLIF(TRIM(d2.name), '')
          FROM DOCTOR_DEPARTMENT dd
          INNER JOIN DEPARTMENT d2 ON d2.id = dd.department_id
          WHERE dd.doctor_id = d.doctor_id
          ORDER BY dd.department_id ASC
          LIMIT 1),
         NULLIF(TRIM(d.specifications), ''),
         ''
       ) AS department,
       a.room_id AS roomId,
       COALESCE(cr.name, '') AS roomName,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.last_name,''), ' ', COALESCE(pu.first_name,''))), ''), pacc.username, '') AS patientName
     FROM APPOINTMENT a
     JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     JOIN USER du ON du.id = d.user_id
     JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
     LEFT JOIN USER pu ON pu.id = p.user_id
     LEFT JOIN ACCOUNT pacc ON pacc.user_id = p.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep_room ON dep_room.id = cr.department_id
     WHERE (:hasStart = 0 OR DATE(a.time) >= :startDate)
       AND (:hasEnd = 0 OR DATE(a.time) <= :endDate)
       AND (:isPatientView = 0 OR (a.status <> 'cancelled' AND a.patient_id IS NULL))
     ORDER BY a.time ASC, a.id ASC`,
    {
      replacements: {
        hasStart: hasStart ? 1 : 0,
        hasEnd: hasEnd ? 1 : 0,
        startDate: hasStart ? startDate : null,
        endDate: hasEnd ? endDate : null,
        isPatientView: isPatientView ? 1 : 0,
      },
      type: QueryTypes.SELECT,
    }
  );
}

async function findDoctorPrimaryRoomId(doctorId) {
  const [row] = await sequelize.query(
    'SELECT room_id FROM DOCTOR WHERE doctor_id = :doctorId LIMIT 1',
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  );
  return row?.room_id ?? null;
}

async function findAppointmentAtDoctorRoomTime(doctorId, roomId, dateTime) {
  const [row] = await sequelize.query(
    `SELECT id FROM APPOINTMENT
     WHERE doctor_id = :doctorId AND room_id = :roomId AND time = :dt
     LIMIT 1`,
    { replacements: { doctorId, roomId, dt: dateTime }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function insertOpenSlotRow({ time, condition, doctorId, roomId }) {
  const [id] = await sequelize.query(
    `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id)
     VALUES (:time, 'scheduled', :condition, NULL, :doctorId, :roomId, NULL)`,
    { replacements: { time, condition, doctorId, roomId }, type: QueryTypes.INSERT }
  );
  return id;
}

async function getSlotByIdForNurseUpdate(id) {
  const [slot] = await sequelize.query(
    `SELECT
       id,
       patient_id AS patientId,
       doctor_id AS doctorId,
       room_id AS roomId,
       time AS slotTime,
       status
     FROM APPOINTMENT WHERE id = :id LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return slot || null;
}

async function findDoctorDefaultRoomRow(doctorId) {
  const [row] = await sequelize.query(
    'SELECT room_id AS roomId FROM DOCTOR WHERE doctor_id = :did LIMIT 1',
    { replacements: { did: doctorId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function findDoctorScheduledConflictExcluding(doctorId, dateTime, excludeId) {
  const [row] = await sequelize.query(
    `SELECT id FROM APPOINTMENT
     WHERE doctor_id = :doctorId
       AND time = :dt
       AND status = 'scheduled'
       AND id <> :id
     LIMIT 1`,
    { replacements: { doctorId, dt: dateTime, id: excludeId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function getDoctorDisplayNameRow(doctorId) {
  const [row] = await sequelize.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
     FROM DOCTOR d
     JOIN USER u ON u.id = d.user_id
     JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE d.doctor_id = :did LIMIT 1`,
    { replacements: { did: doctorId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function getDepartmentNameForAppointmentById(appointmentId) {
  const [row] = await sequelize.query(
    `SELECT COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName
     FROM APPOINTMENT a
     JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.id = :id LIMIT 1`,
    { replacements: { id: appointmentId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function updateSlotTimeDoctorRoom(appointmentId, dateTime, doctorId, roomId) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET time = :time, doctor_id = :doctorId, room_id = :roomId
     WHERE id = :id`,
    { replacements: { id: appointmentId, time: dateTime, doctorId, roomId }, type: QueryTypes.UPDATE }
  );
}

async function getSlotIdAndPatientForDelete(id) {
  const [slot] = await sequelize.query(
    'SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id LIMIT 1',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return slot || null;
}

async function cancelOpenSlotById(id) {
  await sequelize.query(
    "UPDATE APPOINTMENT SET status = 'cancelled' WHERE id = :id",
    { replacements: { id }, type: QueryTypes.UPDATE }
  );
}

async function listDoctorRowsForBookingCatalog() {
  return sequelize.query(
    `SELECT
       d.doctor_id AS id,
       a.username,
       u.first_name AS firstName,
       u.last_name AS lastName,
       d.specifications AS specifications,
       cr.name AS room,
       dep.name AS deptName
     FROM DOCTOR d
     JOIN ACCOUNT a ON a.user_id = d.user_id
     JOIN USER u ON u.id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = d.room_id
     LEFT JOIN DOCTOR_DEPARTMENT dd ON dd.doctor_id = d.doctor_id
     LEFT JOIN DEPARTMENT dep ON dep.id = dd.department_id
     ORDER BY u.first_name ASC, u.last_name ASC, d.doctor_id ASC, dep.name ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function listClinicRoomsCatalog() {
  return sequelize.query(
    `SELECT
       cr.id,
       cr.name,
       cr.capacity,
       cr.department_id AS departmentId,
       dep.name AS departmentName
     FROM CLINIC_ROOM cr
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     ORDER BY dep.name ASC, cr.name ASC, cr.id ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function listDepartmentsCatalog() {
  return sequelize.query(
    `SELECT id, name
     FROM DEPARTMENT
     ORDER BY name ASC`,
    { type: QueryTypes.SELECT }
  );
}

module.exports = {
  normalizeDoctorInput,
  findPatientIdByUserId,
  findPatientPkByRouteId,
  findRescheduleSourceAppointment,
  findDoctorByDisplayInput,
  findDoctorByPrimaryKey,
  findClinicRoomIdByName,
  findAnyClinicRoomId,
  findScheduledSlotAtDoctorRoomTime,
  getAppointmentPatientId,
  bookPatientOnAppointment,
  insertAppointmentRow,
  releaseRescheduleSourceAppointment,
  listPatientAppointmentsForPortal,
  findPatientAppointmentSummary,
  setAppointmentCancelledWithReason,
  setAppointmentStatusIfDifferent,
  findOwnedAppointmentId,
  getAppointmentStatusForPatient,
  cancelAppointmentByPatient,
  doctorsShareDepartment,
  listBookedSlotsForDate,
  listOpenSlotsInRange,
  findDoctorPrimaryRoomId,
  findAppointmentAtDoctorRoomTime,
  insertOpenSlotRow,
  getSlotByIdForNurseUpdate,
  findDoctorDefaultRoomRow,
  findDoctorScheduledConflictExcluding,
  getDoctorDisplayNameRow,
  getDepartmentNameForAppointmentById,
  updateSlotTimeDoctorRoom,
  getSlotIdAndPatientForDelete,
  cancelOpenSlotById,
  listDoctorRowsForBookingCatalog,
  listClinicRoomsCatalog,
  listDepartmentsCatalog,
};
