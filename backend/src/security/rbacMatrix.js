const RBAC_MATRIX = Object.freeze({
  'doctor.emr.read': ['doctor', 'admin', 'nurse', 'technician'],
  'doctor.emr.write': ['doctor', 'admin'],
  'doctor.cover.manage': ['doctor'],
  'appointments.read.self': ['patient'],
  'appointments.write.self': ['patient'],
  'appointments.manage.open_slots': ['admin', 'nurse'],
  'appointments.nurse.checkin': ['admin', 'nurse'],
  'ai.models.inspect': ['admin'],
  'ai.clinical.assist': ['doctor', 'admin'],
});

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isRoleAllowed(capability, role) {
  const allow = RBAC_MATRIX[capability] || [];
  return allow.includes(normalizeRole(role));
}

module.exports = {
  RBAC_MATRIX,
  isRoleAllowed,
  normalizeRole,
};
