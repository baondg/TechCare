const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** ICD-10 codes whose code or description contains `q` ('' = all); max 300. */
async function searchDiseases(q) {
  return sequelize.query(
    `SELECT
         icd_code AS code,
         description
       FROM DISEASE
       WHERE (:q = '' OR icd_code LIKE :likeQ OR description LIKE :likeQ)
       ORDER BY icd_code ASC
       LIMIT 300`,
    { replacements: { q, likeQ: `%${q}%` }, type: QueryTypes.SELECT }
  );
}

/** MEDICINE rows whose name contains `q` ('' = all); max 300. */
async function searchMedicines(q) {
  return sequelize.query(
    `SELECT id, name, unit
       FROM MEDICINE
       WHERE (:q = '' OR name LIKE :likeQ)
       ORDER BY name ASC
       LIMIT 300`,
    { replacements: { q, likeQ: `%${q}%` }, type: QueryTypes.SELECT }
  );
}

/** Technicians with a display name (full name, else username). */
async function listTechnicians() {
  return sequelize.query(
    `SELECT
         te.technician_id AS technicianId,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           a.username
         ) AS technicianName
       FROM TECHNICIAN te
       JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       ORDER BY technicianName ASC
       LIMIT 1000`,
    { type: QueryTypes.SELECT }
  );
}

async function listDepartments() {
  return sequelize.query('SELECT id, name FROM DEPARTMENT ORDER BY name ASC', { type: QueryTypes.SELECT });
}

module.exports = { searchDiseases, searchMedicines, listTechnicians, listDepartments };
