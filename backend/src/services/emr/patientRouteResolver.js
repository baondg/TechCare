const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { resolvePatientPkFromRoute, parseOpRouteNumeric } = require('../../common/resolvePatientRouteId');

function parseRoutePatientId(patientId) {
  const n = Number(String(patientId).replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * PATIENT.patient_id from EMR route param (OP encodes USER.id from portal lists).
 */
async function resolveCanonicalPatientIdFromEmrParam(patientIdParam) {
  const pk = await resolvePatientPkFromRoute(patientIdParam);
  if (pk != null) return pk;
  const n = parseOpRouteNumeric(patientIdParam);
  return n;
}

/** PATIENT.patient_id PK from OP… / numeric route (no fallback to raw n if no row). */
async function resolvePatientPkFromOpRoute(patientIdParam, transaction) {
  return resolvePatientPkFromRoute(patientIdParam, transaction);
}

/**
 * Resolve PATIENT.patient_id from route param (supports OP-padded id or raw user_id / patient_id).
 */
async function resolvePatientPkFromRouteParam(patientIdParam, transaction) {
  const routeVal = parseRoutePatientId(patientIdParam);
  if (!routeVal) return null;
  const rows = await sequelize.query(
    `SELECT patient_id FROM PATIENT WHERE user_id = :v OR patient_id = :v LIMIT 1`,
    { replacements: { v: routeVal }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.patient_id ?? null;
}

module.exports = {
  resolveCanonicalPatientIdFromEmrParam,
  resolvePatientPkFromOpRoute,
  resolvePatientPkFromRouteParam,
};
