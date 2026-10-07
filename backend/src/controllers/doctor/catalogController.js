const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const logger = require('../../common/logger');

// ═══════════════════════════════════════════════
//  DIAGNOSES
// ═══════════════════════════════════════════════

exports.getDiseaseCodes = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await sequelize.query(
      `SELECT
         icd_code AS code,
         description
       FROM DISEASE
       WHERE (:q = '' OR icd_code LIKE :likeQ OR description LIKE :likeQ)
       ORDER BY icd_code ASC
       LIMIT 300`,
      {
        replacements: { q, likeQ: `%${q}%` },
        type: QueryTypes.SELECT
      }
    );
    res.json({ success: true, diseases: rows });
  } catch (error) {
    logger.error({ err: error }, 'Get disease codes error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/medicines?q=
 * List medicine names from MEDICINE (for prescription combobox).
 */
exports.getMedicines = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await sequelize.query(
      `SELECT id, name, unit
       FROM MEDICINE
       WHERE (:q = '' OR name LIKE :likeQ)
       ORDER BY name ASC
       LIMIT 300`,
      {
        replacements: { q, likeQ: `%${q}%` },
        type: QueryTypes.SELECT
      }
    );
    res.json({ success: true, medicines: rows });
  } catch (error) {
    logger.error({ err: error }, 'Get medicines error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/technicians
 * List all technicians in the system (for technician combobox).
 */
exports.getTechnicians = async (req, res) => {
  try {
    const rows = await sequelize.query(
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

    res.json({ success: true, technicians: rows });
  } catch (error) {
    logger.error({ err: error }, 'Get technicians error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/departments
 * Master list of DEPARTMENT for combobox usage.
 */
exports.getDepartments = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name
       FROM DEPARTMENT
       ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    const departments = rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim(),
    }));
    res.json({ success: true, departments });
  } catch (error) {
    logger.error({ err: error }, 'Get departments error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
