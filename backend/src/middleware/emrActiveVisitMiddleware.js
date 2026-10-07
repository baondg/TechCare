const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { resolvePatientPkFromRoute } = require('../common/resolvePatientRouteId');
const logger = require('../common/logger');

async function patientHasOpenRegimen(patientId) {
  const [row] = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :pid AND \`end\` IS NULL
     ORDER BY \`start\` DESC, id DESC
     LIMIT 1`,
    { replacements: { pid: patientId }, type: QueryTypes.SELECT }
  );
  return !!row;
}

/**
 * Block POST/PUT/PATCH/DELETE under /patients/:patientId/* for doctor & technician
 * when the patient has no open REGIMEN (nurse check-in not done).
 * Nurse and admin are not restricted here.
 */
async function requireActiveEmrVisitForDoctorTech(req, res, next) {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['doctor', 'technician'].includes(role)) return next();

    const m = String(req.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return next();

    const path = req.path || '';
    /** Health info can be maintained by doctors like nurses (no open-regimen gate). */
    if (path.includes('/health-info')) return next();

    const match = path.match(/^\/patients\/([^/]+)\//);
    if (!match) return next();

    const pid = await resolvePatientPkFromRoute(match[1]);
    if (!pid) return next();

    const ok = await patientHasOpenRegimen(pid);
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: 'Patient has no active visit. Complete nurse check-in before recording data.',
      });
    }
    return next();
  } catch (e) {
    logger.error({ err: e }, 'requireActiveEmrVisitForDoctorTech');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { requireActiveEmrVisitForDoctorTech };
