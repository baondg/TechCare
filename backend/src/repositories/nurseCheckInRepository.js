const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { getClinicTodayYmd } = require('../common/clinicDate');
const { resolvePatientPkFromRoute } = require('../common/resolvePatientRouteId');

function withClinicToday(replacements = {}) {
  return { ...replacements, clinicToday: getClinicTodayYmd() };
}

const NURSE_APPT_SELECT = `
  SELECT
    a.id,
    a.time AS slotTime,
    DATE_FORMAT(a.time, '%Y-%m-%d') AS wallDate,
    TIME_FORMAT(a.time, '%H:%i:%s') AS wallTime,
    a.\`condition\` AS conditionNote,
    a.regimen_id AS regimenId,
    a.doctor_id AS doctorId,
    a.room_id AS roomId,
    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''), ' ', COALESCE(du.last_name,''))), ''), dacc.username) AS doctorName,
    COALESCE(d.specifications, '') AS department,
    COALESCE(cr.name, '') AS roomName
  FROM APPOINTMENT a
  JOIN DOCTOR d ON d.doctor_id = a.doctor_id
  JOIN USER du ON du.id = d.user_id
  JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
  LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
`;

/** APPOINTMENT.patient_id may be PATIENT.patient_id or legacy USER.id. */
const SQL_A_PATIENT_MATCH = `(
  a.patient_id = :patientId
  OR a.patient_id = (
    SELECT p.user_id FROM PATIENT p WHERE p.patient_id = :patientId LIMIT 1
  )
)`;

const SQL_ROW_PATIENT_MATCH = `(
  patient_id = :patientId
  OR patient_id = (
    SELECT p.user_id FROM PATIENT p WHERE p.patient_id = :patientId LIMIT 1
  )
)`;

function qTx(transaction, base) {
  return transaction ? { ...base, transaction } : base;
}

async function findNursePatientPkFromNumeric(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  return resolvePatientPkFromRoute(n);
}

async function findPatientPkExists(patientPk) {
  const pk = Number(patientPk);
  if (!Number.isFinite(pk) || pk <= 0) return null;
  const [row] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE patient_id = :pk LIMIT 1',
    { replacements: { pk }, type: QueryTypes.SELECT }
  );
  return row?.id != null ? Number(row.id) : null;
}

async function selectCurDate() {
  return getClinicTodayYmd();
}

async function listNurseBookedTodayForPatient(patientId) {
  return sequelize.query(
    `${NURSE_APPT_SELECT}
     WHERE a.status = 'scheduled'
       AND DATE(a.time) = :clinicToday
       AND (
         a.patient_id = :patientId
         OR a.patient_id = (
           SELECT p.user_id FROM PATIENT p WHERE p.patient_id = :patientId LIMIT 1
         )
       )
     ORDER BY a.time ASC, a.id ASC`,
    { replacements: withClinicToday({ patientId }), type: QueryTypes.SELECT }
  );
}

async function findNurseBookedTodayByAppointmentId(appointmentId, patientId) {
  const [row] = await sequelize.query(
    `${NURSE_APPT_SELECT}
     WHERE a.id = :appointmentId
       AND a.status = 'scheduled'
       AND DATE(a.time) = :clinicToday
       AND (
         a.patient_id = :patientId
         OR a.patient_id = (
           SELECT p.user_id FROM PATIENT p WHERE p.patient_id = :patientId LIMIT 1
         )
       )
     LIMIT 1`,
    { replacements: withClinicToday({ appointmentId, patientId }), type: QueryTypes.SELECT }
  );
  return row || null;
}

async function listNurseOpenSlotsToday() {
  return sequelize.query(
    `${NURSE_APPT_SELECT}
     WHERE a.patient_id IS NULL
       AND a.status = 'scheduled'
       AND DATE(a.time) = :clinicToday
     ORDER BY a.time ASC, a.id ASC`,
    { replacements: withClinicToday(), type: QueryTypes.SELECT }
  );
}

async function findNurseAcceptAppointment(appointmentId, patientId) {
  const [row] = await sequelize.query(
    `${NURSE_APPT_SELECT}
     WHERE a.id = :appointmentId
       AND ${SQL_A_PATIENT_MATCH}
       AND a.status = 'scheduled'
       AND DATE(a.time) = :clinicToday
     LIMIT 1`,
    { replacements: withClinicToday({ appointmentId, patientId }), type: QueryTypes.SELECT }
  );
  return row || null;
}

async function findClinicRoomIdExists(roomId) {
  const [row] = await sequelize.query(
    'SELECT id FROM CLINIC_ROOM WHERE id = :roomId LIMIT 1',
    { replacements: { roomId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function updateNurseAppointmentRoomToday(appointmentId, patientId, roomId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT SET room_id = :roomId
     WHERE id = :appointmentId AND ${SQL_ROW_PATIENT_MATCH}
       AND status = 'scheduled' AND DATE(\`time\`) = :clinicToday`,
    qTx(transaction, {
      replacements: withClinicToday({ roomId, appointmentId, patientId }),
      type: QueryTypes.UPDATE,
    })
  );
}

async function updateAppointmentRegimenId(appointmentId, patientId, regimenId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT SET regimen_id = :regimenId WHERE id = :appointmentId AND ${SQL_ROW_PATIENT_MATCH}`,
    qTx(transaction, { replacements: { regimenId, appointmentId, patientId }, type: QueryTypes.UPDATE })
  );
}

async function findOpenSlotForAssignToday(appointmentId) {
  const [slot] = await sequelize.query(
    `SELECT id, patient_id AS patientId, status
     FROM APPOINTMENT
     WHERE id = :appointmentId
       AND patient_id IS NULL
       AND status = 'scheduled'
       AND DATE(\`time\`) = :clinicToday
     LIMIT 1`,
    { replacements: withClinicToday({ appointmentId }), type: QueryTypes.SELECT }
  );
  return slot || null;
}

async function assignPatientToOpenSlot(appointmentId, patientId, condition, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled'
     WHERE id = :appointmentId AND patient_id IS NULL`,
    qTx(transaction, { replacements: { patientId, condition, appointmentId }, type: QueryTypes.UPDATE })
  );
}

async function getAppointmentPatientIdRow(appointmentId, transaction) {
  const [check] = await sequelize.query(
    `SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :appointmentId LIMIT 1`,
    qTx(transaction, { replacements: { appointmentId }, type: QueryTypes.SELECT })
  );
  return check;
}

async function getNurseAppointmentDisplay(appointmentId) {
  const [row] = await sequelize.query(
    `${NURSE_APPT_SELECT} WHERE a.id = :appointmentId LIMIT 1`,
    { replacements: { appointmentId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function findRescheduleSourceAppointmentToday(fromAppointmentId, patientId, transaction) {
  const [fromRow] = await sequelize.query(
    `SELECT id, patient_id AS patientId, \`condition\` AS cond, status
     FROM APPOINTMENT
     WHERE id = :fromAppointmentId
       AND ${SQL_ROW_PATIENT_MATCH}
       AND status = 'scheduled'
       AND DATE(\`time\`) = :clinicToday
     LIMIT 1`,
    qTx(transaction, {
      replacements: withClinicToday({ fromAppointmentId, patientId }),
      type: QueryTypes.SELECT,
    })
  );
  return fromRow || null;
}

async function findRescheduleTargetOpenToday(toAppointmentId, transaction) {
  const [toRow] = await sequelize.query(
    `SELECT id, patient_id AS patientId, status
     FROM APPOINTMENT
     WHERE id = :toAppointmentId
       AND patient_id IS NULL
       AND status = 'scheduled'
       AND DATE(\`time\`) = :clinicToday
     LIMIT 1`,
    qTx(transaction, { replacements: withClinicToday({ toAppointmentId }), type: QueryTypes.SELECT })
  );
  return toRow || null;
}

async function clearPatientFromSlot(fromAppointmentId, patientId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET patient_id = NULL, \`condition\` = 'Open slot', regimen_id = NULL
     WHERE id = :fromAppointmentId AND ${SQL_ROW_PATIENT_MATCH}`,
    qTx(transaction, { replacements: { fromAppointmentId, patientId }, type: QueryTypes.UPDATE })
  );
}

async function assignPatientToSlotReserved(toAppointmentId, patientId, condition, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT
     SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled'
     WHERE id = :toAppointmentId AND patient_id IS NULL`,
    qTx(transaction, { replacements: { patientId, condition, toAppointmentId }, type: QueryTypes.UPDATE })
  );
}

async function selectLatestDiseaseForPatient(patientId, transaction) {
  const latestRows = await sequelize.query(
    `SELECT r.disease_id AS diseaseId
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    qTx(transaction, { replacements: { patientId }, type: QueryTypes.SELECT })
  );
  return latestRows[0] || null;
}

async function selectZ00Disease(transaction) {
  const zRows = await sequelize.query(
    `SELECT id FROM DISEASE WHERE icd_code = 'Z00.0' LIMIT 1`,
    qTx(transaction, { type: QueryTypes.SELECT })
  );
  return zRows[0] || null;
}

async function insertZ00Disease(transaction) {
  const [insertId] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES ('Z00.0', 'General examination', 'General', NULL)`,
    qTx(transaction, { type: QueryTypes.INSERT })
  );
  return Number(insertId);
}

async function insertRegimenOpenEnd(patientId, diseaseId, transaction) {
  const [regimenId] = await sequelize.query(
    `INSERT INTO REGIMEN (\`start\`, \`end\`, patient_id, disease_id)
     VALUES (NOW(), NULL, :patientId, :diseaseId)`,
    qTx(transaction, { replacements: { patientId, diseaseId }, type: QueryTypes.INSERT })
  );
  return Number(regimenId);
}

async function findLatestOpenRegimenIdForPatient(patientId, transaction) {
  const [active] = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND \`end\` IS NULL
     ORDER BY \`start\` DESC, id DESC
     LIMIT 1`,
    qTx(transaction, { replacements: { patientId }, type: QueryTypes.SELECT })
  );
  return active?.id != null ? Number(active.id) : null;
}

async function findOpenRegimenForPatient(regimenId, patientId, transaction) {
  const [active] = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE id = :regimenId AND patient_id = :patientId AND \`end\` IS NULL
     LIMIT 1`,
    qTx(transaction, { replacements: { regimenId, patientId }, type: QueryTypes.SELECT })
  );
  return active || null;
}

async function clearAppointmentRegimenLinks(patientId, regimenId, transaction) {
  await sequelize.query(
    `UPDATE APPOINTMENT SET regimen_id = NULL
     WHERE patient_id = :patientId AND regimen_id = :regimenId`,
    qTx(transaction, { replacements: { patientId, regimenId }, type: QueryTypes.UPDATE })
  );
}

async function completeAppointmentsForClosedRegimens(patientId, regimenIds, transaction) {
  const ids = (regimenIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return;
  const idCsv = ids.join(',');
  await sequelize.query(
    `UPDATE APPOINTMENT SET status = 'completed'
     WHERE patient_id = :patientId
       AND regimen_id IN (${idCsv})
       AND status = 'scheduled'`,
    qTx(transaction, { replacements: { patientId }, type: QueryTypes.UPDATE })
  );
}

async function clearAppointmentRegimenLinksForRegimenIds(patientId, regimenIds, transaction) {
  const ids = (regimenIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return;
  const idCsv = ids.join(',');
  await sequelize.query(
    `UPDATE APPOINTMENT SET regimen_id = NULL
     WHERE patient_id = :patientId AND regimen_id IN (${idCsv})`,
    qTx(transaction, { replacements: { patientId }, type: QueryTypes.UPDATE })
  );
}

async function closeRegimenEndNow(regimenId, patientId, transaction) {
  await sequelize.query(
    `UPDATE REGIMEN SET \`end\` = NOW()
     WHERE id = :regimenId AND patient_id = :patientId AND \`end\` IS NULL`,
    qTx(transaction, { replacements: { regimenId, patientId }, type: QueryTypes.UPDATE })
  );
  await clearAppointmentRegimenLinks(patientId, regimenId, transaction);
}

module.exports = {
  findNursePatientPkFromNumeric,
  findPatientPkExists,
  selectCurDate,
  listNurseBookedTodayForPatient,
  findNurseBookedTodayByAppointmentId,
  listNurseOpenSlotsToday,
  findNurseAcceptAppointment,
  findClinicRoomIdExists,
  updateNurseAppointmentRoomToday,
  updateAppointmentRegimenId,
  findOpenSlotForAssignToday,
  assignPatientToOpenSlot,
  getAppointmentPatientIdRow,
  getNurseAppointmentDisplay,
  findRescheduleSourceAppointmentToday,
  findRescheduleTargetOpenToday,
  clearPatientFromSlot,
  assignPatientToSlotReserved,
  selectLatestDiseaseForPatient,
  selectZ00Disease,
  insertZ00Disease,
  insertRegimenOpenEnd,
  findLatestOpenRegimenIdForPatient,
  findOpenRegimenForPatient,
  completeAppointmentsForClosedRegimens,
  clearAppointmentRegimenLinks,
  clearAppointmentRegimenLinksForRegimenIds,
  closeRegimenEndNow,
};
