const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

const STAFF_COLUMNS = new Set(['doctor_id', 'nurse_id', 'technician_id']);

async function selectDoctorStaffIdByUserId(userId) {
  const [doc] = await sequelize.query(
    'SELECT doctor_id AS id FROM DOCTOR WHERE user_id = :uid LIMIT 1',
    { replacements: { uid: userId }, type: QueryTypes.SELECT }
  );
  return doc?.id != null ? Number(doc.id) : null;
}

async function selectNurseStaffIdByUserId(userId) {
  const [nur] = await sequelize.query(
    'SELECT nurse_id AS id FROM NURSE WHERE user_id = :uid LIMIT 1',
    { replacements: { uid: userId }, type: QueryTypes.SELECT }
  );
  return nur?.id != null ? Number(nur.id) : null;
}

async function selectTechnicianStaffIdByUserId(userId) {
  const [tec] = await sequelize.query(
    'SELECT technician_id AS id FROM TECHNICIAN WHERE user_id = :uid LIMIT 1',
    { replacements: { uid: userId }, type: QueryTypes.SELECT }
  );
  return tec?.id != null ? Number(tec.id) : null;
}

async function listClinicalStaffDirectory() {
  return sequelize.query(
    `SELECT u.id AS userId,
            u.first_name AS firstName,
            u.last_name AS lastName,
            acc.type AS accountType
     FROM ACCOUNT acc
     INNER JOIN \`USER\` u ON u.id = acc.user_id
     WHERE acc.type IN ('DOC','NUR','TEC') AND acc.status = 1
     ORDER BY
       CASE acc.type WHEN 'DOC' THEN 1 WHEN 'NUR' THEN 2 WHEN 'TEC' THEN 3 ELSE 9 END,
       u.last_name, u.first_name`,
    { type: QueryTypes.SELECT }
  );
}

async function listWorkShiftsInRange({ staffColumn, staffId, startDt, endDt, wantAll }) {
  const staffFilter = wantAll
    ? 'ws.start_time < :endDt AND ws.end_time > :startDt'
    : `ws.${staffColumn} = :staffId AND ws.start_time < :endDt AND ws.end_time > :startDt`;

  const replacements = wantAll ? { startDt, endDt } : { staffId, startDt, endDt };

  return sequelize.query(
    `SELECT
       ws.id,
       DATE_FORMAT(ws.start_time, '%Y-%m-%d %H:%i:%s') AS startTime,
       DATE_FORMAT(ws.end_time, '%Y-%m-%d %H:%i:%s') AS endTime,
       ws.room_id AS roomId,
       ws.doctor_id AS doctorId,
       ws.nurse_id AS nurseId,
       ws.technician_id AS technicianId,
       cr.name AS roomName,
       dep.name AS departmentName,
       docU.first_name AS doctorFirstName,
       docU.last_name AS doctorLastName,
       nurU.first_name AS nurseFirstName,
       nurU.last_name AS nurseLastName,
       tecU.first_name AS technicianFirstName,
       tecU.last_name AS technicianLastName
     FROM WORK_SHIFT ws
     INNER JOIN CLINIC_ROOM cr ON cr.id = ws.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     LEFT JOIN DOCTOR d ON d.doctor_id = ws.doctor_id
     LEFT JOIN \`USER\` docU ON docU.id = d.user_id
     LEFT JOIN \`NURSE\` n ON n.nurse_id = ws.nurse_id
     LEFT JOIN \`USER\` nurU ON nurU.id = n.user_id
     LEFT JOIN TECHNICIAN t ON t.technician_id = ws.technician_id
     LEFT JOIN \`USER\` tecU ON tecU.id = t.user_id
     WHERE ${staffFilter}
     ORDER BY ws.start_time ASC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

function isAllowedStaffColumn(column) {
  return STAFF_COLUMNS.has(column);
}

module.exports = {
  selectDoctorStaffIdByUserId,
  selectNurseStaffIdByUserId,
  selectTechnicianStaffIdByUserId,
  listClinicalStaffDirectory,
  listWorkShiftsInRange,
  isAllowedStaffColumn,
};
