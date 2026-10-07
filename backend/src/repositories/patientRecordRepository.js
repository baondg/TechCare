const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const Account = require('../models/Account');
const User = require('../models/Users');
const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS } = require('./treatmentRepository');

/** Display name of the treating doctor (alias d / u / a). */
const DOCTOR_NAME_SQL =
  "COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id))";

// ─── Patient list (batch) ───

/**
 * One page of patient USER rows (ACCOUNT type PAT), newest first, optionally filtered by `search`.
 * @returns {Promise<{ count: number, rows: import('sequelize').Model[] }>}
 */
async function listPatientUsers({ search, limit, offset }) {
  const where = {};
  if (search) {
    where[Op.or] = [
      { username: { [Op.like]: `%${search}%` } },
      { firstName: { [Op.like]: `%${search}%` } },
      { lastName: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }
  return User.findAndCountAll({
    include: [
      {
        model: Account,
        required: true,
        where: { type: 'PAT' },
        attributes: ['username'],
      },
    ],
    attributes: ['id', 'email', 'first_name', 'last_name', 'dob', 'sex', 'idcard', 'tel'],
    order: [['id', 'DESC']],
    limit,
    offset,
  });
}

/** userId → current department name (latest treatment department, else latest appointment room's). */
async function listCurrentDepartmentByUserIds(userIds) {
  const placeholders = userIds.map(() => '?').join(',');
  return sequelize.query(
    `SELECT
       pt.user_id AS userId,
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
     WHERE pt.user_id IN (${placeholders})`,
    { replacements: userIds, type: QueryTypes.SELECT }
  );
}

/** @returns {Promise<Array<{ userId, patientPk }>>} */
async function listPatientPksByUserIds(userIds) {
  const ph = userIds.map(() => '?').join(',');
  return sequelize.query(`SELECT user_id AS userId, patient_id AS patientPk FROM PATIENT WHERE user_id IN (${ph})`, {
    replacements: userIds,
    type: QueryTypes.SELECT,
  });
}

/** Latest standalone diagnosis per patient: rows { patientPk, visitTime, icd10, interpretation, doctorName, … }. */
async function listLatestDiagnosisByPatientPks(patientPks) {
  const ph = patientPks.map(() => '?').join(',');
  return sequelize.query(
    `
    SELECT * FROM (
      SELECT
        r.patient_id AS patientPk,
        t.time AS visitTime,
        t.type AS department,
        t.\`condition\` AS complaint,
        dis.icd_code AS icd10,
        dis.description AS interpretation,
        ${DOCTOR_NAME_SQL} AS doctorName,
        ROW_NUMBER() OVER (PARTITION BY r.patient_id ORDER BY t.time DESC, t.id DESC) AS rn
      FROM TREATMENT t
      JOIN REGIMEN r ON r.id = t.regimen_id
      LEFT JOIN DISEASE dis ON dis.id = r.disease_id
      LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
      LEFT JOIN USER u ON u.id = d.user_id
      LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
      WHERE r.patient_id IN (${ph})
      ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
    ) ranked
    WHERE ranked.rn = 1`,
    { replacements: patientPks, type: QueryTypes.SELECT }
  );
}

/** Latest MEDICAL_RECORD height / weight per patient: rows { patientPk, height, weight }. */
async function listLatestBodyMeasuresByPatientPks(patientPks) {
  const ph = patientPks.map(() => '?').join(',');
  return sequelize.query(
    `
    SELECT * FROM (
      SELECT
        patient_id AS patientPk,
        weight,
        height,
        ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY time DESC, id DESC) AS rn
      FROM MEDICAL_RECORD
      WHERE patient_id IN (${ph})
    ) x
    WHERE x.rn = 1`,
    { replacements: patientPks, type: QueryTypes.SELECT }
  );
}

// ─── Single patient record ───

/**
 * Patient header by route id: USER.id first, else PATIENT.patient_id (with account and insurance).
 * @returns {Promise<object | null>}
 */
async function findPatientHeader(routeId) {
  const [row] = await sequelize.query(
    `SELECT
       u.id,
       u.email,
       u.first_name,
       u.last_name,
       u.dob,
       u.sex,
       u.idcard,
       u.tel,
       p.patient_id AS patientPk,
       acc.username,
       hi.id AS healthInsuranceId,
       hi.expired_date AS healthInsuranceExpiredDate
     FROM USER u
     LEFT JOIN PATIENT p ON p.user_id = u.id
     LEFT JOIN ACCOUNT acc ON acc.user_id = u.id
     LEFT JOIN HEALTH_INSURANCE hi ON hi.patient_id = p.patient_id
     WHERE u.id = :routeId OR p.patient_id = :routeId
     ORDER BY CASE WHEN u.id = :routeId THEN 0 ELSE 1 END
     LIMIT 1`,
    { replacements: { routeId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** The patient's latest standalone diagnosis, or null. */
async function findLatestDiagnosis(patientPk) {
  const [row] = await sequelize.query(
    `SELECT
       t.time AS visitTime,
       t.type AS department,
       t.\`condition\` AS complaint,
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
         a.username,
         CONCAT('doctor#', d.user_id)
       ) AS doctorName
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE r.patient_id = :patientPk
     ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** @returns {Promise<{ weight, height } | null>} latest MEDICAL_RECORD measures */
async function findLatestBodyMeasures(patientPk) {
  const [row] = await sequelize.query(
    `SELECT weight, height
     FROM MEDICAL_RECORD
     WHERE patient_id = :patientPk
     ORDER BY time DESC, id DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** @returns {Promise<{ inDepartment, inDeptId } | null>} department of the latest TREATMENT that has one */
async function findLatestTreatmentDepartment(patientPk) {
  const [row] = await sequelize.query(
    `SELECT dep.name AS inDepartment, t.dept_id AS inDeptId
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DEPARTMENT dep ON dep.id = t.dept_id
     WHERE r.patient_id = :patientPk
       AND t.dept_id IS NOT NULL
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** @returns {Promise<{ inDepartment, inDeptId } | null>} department of the latest appointment's room */
async function findLatestAppointmentDepartment(patientPk) {
  const [row] = await sequelize.query(
    `SELECT dep.name AS inDepartment, cr.department_id AS inDeptId
     FROM APPOINTMENT a
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.patient_id = :patientPk
     ORDER BY a.time DESC, a.id DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
  return row || null;
}

module.exports = {
  listPatientUsers,
  listCurrentDepartmentByUserIds,
  listPatientPksByUserIds,
  listLatestDiagnosisByPatientPks,
  listLatestBodyMeasuresByPatientPks,
  findPatientHeader,
  findLatestDiagnosis,
  findLatestBodyMeasures,
  findLatestTreatmentDepartment,
  findLatestAppointmentDepartment,
};
