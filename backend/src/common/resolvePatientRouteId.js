const patientRepository = require('../repositories/patientRepository');

function parseOpRouteNumeric(patientIdParam) {
  const n = Number(String(patientIdParam ?? '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** PATIENT.patient_id for an OP… / numeric route param: tried as USER.id first, then as patient_id. */
async function resolvePatientPkFromRoute(patientIdParam, transaction) {
  const n = parseOpRouteNumeric(patientIdParam);
  if (n == null) return null;
  return (
    (await patientRepository.findPatientPkByUserId(n, transaction)) ??
    patientRepository.findPatientPk(n, transaction)
  );
}

/** USER.id of the patient for an OP… / numeric route param (same lookup order). */
async function resolveUserIdFromRoute(patientIdParam, transaction) {
  const n = parseOpRouteNumeric(patientIdParam);
  if (n == null) return null;
  return (
    (await patientRepository.findPatientUserId(n, transaction)) ??
    patientRepository.findUserIdByPatientPk(n, transaction)
  );
}

module.exports = {
  parseOpRouteNumeric,
  resolvePatientPkFromRoute,
  resolveUserIdFromRoute,
};
