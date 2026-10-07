const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * REGIMEN = one visit (nurse check-in opens it, the doctor's "finish examination" closes it).
 * `patientRef` in the room lookups is the number from the route (OP… stripped), matched against
 * PATIENT.patient_id or PATIENT.user_id.
 */

/** `{ regimenId, startAt }` of the patient's latest open visit, or null. */
async function findLatestOpenRegimen(patientId, transaction) {
  const [row] = await sequelize.query(
    `SELECT id AS regimenId, \`start\` AS startAt
     FROM REGIMEN
     WHERE patient_id = :pid AND \`end\` IS NULL
     ORDER BY \`start\` DESC, id DESC
     LIMIT 1`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT, transaction }
  );
  return row || null;
}

/** Every open visit of the patient (`{ regimenId, regimenStart }`), latest first. */
async function listOpenRegimens(patientId) {
  return sequelize.query(
    `SELECT id AS regimenId, \`start\` AS regimenStart
     FROM REGIMEN
     WHERE patient_id = :pid AND \`end\` IS NULL
     ORDER BY \`start\` DESC, id DESC`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
}

/** Ends every open visit of the patient now. */
async function closeOpenRegimens(patientId, transaction) {
  await sequelize.query(
    `UPDATE REGIMEN SET \`end\` = NOW()
     WHERE patient_id = :pid AND \`end\` IS NULL`,
    { replacements: { pid: patientId }, type: QueryTypes.UPDATE, transaction }
  );
}

/** Completed visits (`{ regimenId, regimenStart, regimenEnd, icd10, diseaseDescription }`), latest first. */
async function listCompletedRegimens(patientId) {
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

// ─── Check-in room: the patient's scheduled appointment that belongs to the visit ───

/** LEFT JOIN: APPOINTMENT.room_id must still resolve if the CLINIC_ROOM row is missing (bad FK / seed data). */
const SCHEDULED_APPOINTMENT_ROOM = `
  SELECT a.room_id AS roomId,
         COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
  FROM APPOINTMENT a
  LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
  WHERE (a.patient_id IN (SELECT p2.patient_id FROM PATIENT p2 WHERE p2.patient_id = :emrStrip OR p2.user_id = :emrStrip))
    AND a.status = 'scheduled'`;

async function firstRoom(sql, replacements) {
  const [row] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return row || null;
}

/** `{ roomId, roomName }` of the appointment linked to the visit (APPOINTMENT.regimen_id), or null. */
async function findRoomOfLinkedAppointment(patientRef, regimenId) {
  return firstRoom(`${SCHEDULED_APPOINTMENT_ROOM} AND a.regimen_id = :regimenId LIMIT 1`, { emrStrip: patientRef, regimenId });
}

/** Appointment closest to the open visit's start (−3 days … +2 days). */
async function findRoomOfAppointmentClosestToVisit(patientRef, regimenId) {
  return firstRoom(
    `SELECT a.room_id AS roomId,
            COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
     FROM APPOINTMENT a
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     INNER JOIN REGIMEN r ON r.patient_id = a.patient_id AND r.id = :regimenId AND r.\`end\` IS NULL
     WHERE (a.patient_id IN (SELECT p2.patient_id FROM PATIENT p2 WHERE p2.patient_id = :emrStrip OR p2.user_id = :emrStrip))
       AND a.status = 'scheduled'
       AND a.patient_id IS NOT NULL
       AND a.time BETWEEN DATE_SUB(r.\`start\`, INTERVAL 3 DAY) AND DATE_ADD(r.\`start\`, INTERVAL 2 DAY)
     ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, r.\`start\`)) ASC, a.id DESC
     LIMIT 1`,
    { emrStrip: patientRef, regimenId }
  );
}

/** Latest appointment on the same calendar day as `regimenStart`. */
async function findRoomOfAppointmentOnDate(patientRef, regimenStart) {
  return firstRoom(
    `${SCHEDULED_APPOINTMENT_ROOM} AND DATE(a.time) = DATE(:regimenStart)
     ORDER BY a.time DESC, a.id DESC LIMIT 1`,
    { emrStrip: patientRef, regimenStart }
  );
}

/** Latest appointment today (DB clock). */
async function findRoomOfAppointmentToday(patientRef) {
  return firstRoom(
    `${SCHEDULED_APPOINTMENT_ROOM} AND DATE(a.time) = CURDATE()
     ORDER BY a.time DESC, a.id DESC LIMIT 1`,
    { emrStrip: patientRef }
  );
}

/** Appointment closest to `regimenStart` within −5 days … +2 days. */
async function findRoomOfAppointmentNear(patientRef, regimenStart) {
  return firstRoom(
    `${SCHEDULED_APPOINTMENT_ROOM}
     AND a.time BETWEEN DATE_SUB(:regimenStart, INTERVAL 5 DAY) AND DATE_ADD(:regimenStart, INTERVAL 2 DAY)
     ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, :regimenStart)) ASC, a.id DESC LIMIT 1`,
    { emrStrip: patientRef, regimenStart }
  );
}

/** Latest appointment within ±36 hours of `regimenStart`. */
async function findRoomOfAppointmentWithin36h(patientRef, regimenStart) {
  return firstRoom(
    `${SCHEDULED_APPOINTMENT_ROOM}
     AND a.time >= DATE_SUB(:regimenStart, INTERVAL 36 HOUR)
     AND a.time <= DATE_ADD(:regimenStart, INTERVAL 36 HOUR)
     ORDER BY a.time DESC, a.id DESC LIMIT 1`,
    { emrStrip: patientRef, regimenStart }
  );
}

/** Room of the first TREATMENT with a room in the patient's open visits. */
async function findRoomOfFirstTreatmentInOpenVisit(pid) {
  return firstRoom(
    `SELECT t.room_id AS roomId,
            COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', t.room_id)) AS roomName
     FROM TREATMENT t
     LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
     INNER JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :pid AND r.\`end\` IS NULL AND t.room_id IS NOT NULL
     ORDER BY t.time ASC, t.id ASC
     LIMIT 1`,
    { pid }
  );
}

module.exports = {
  findLatestOpenRegimen,
  listOpenRegimens,
  closeOpenRegimens,
  listCompletedRegimens,
  findRoomOfLinkedAppointment,
  findRoomOfAppointmentClosestToVisit,
  findRoomOfAppointmentOnDate,
  findRoomOfAppointmentToday,
  findRoomOfAppointmentNear,
  findRoomOfAppointmentWithin36h,
  findRoomOfFirstTreatmentInOpenVisit,
};
