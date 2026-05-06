const ROLE_CODE_TO_NAME = Object.freeze({
  ADM: 'admin',
  PAT: 'patient',
  DOC: 'doctor',
  NUR: 'nurse',
  TEC: 'technician',
  PHY: 'technician',
});

function normalizeRoleFromCode(roleCodeOrName) {
  const raw = String(roleCodeOrName || '').trim();
  if (!raw) return '';
  return ROLE_CODE_TO_NAME[raw] || raw.toLowerCase();
}

module.exports = {
  ROLE_CODE_TO_NAME,
  normalizeRoleFromCode,
};
