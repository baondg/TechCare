const { isRoleAllowed } = require('../security/rbacMatrix');

/**
 * 403 unless req.user.role holds `capability` (security/rbacMatrix.js).
 * @param {string} capability
 * @param {{ message?: string }} [options] text shown to the client (default 'Forbidden')
 */
function authorizeCapability(capability, { message = 'Forbidden' } = {}) {
  return function capabilityGuard(req, res, next) {
    const role = req?.user?.role;
    if (!isRoleAllowed(capability, role)) {
      return res.status(403).json({
        success: false,
        error: message,
        message,
        capability,
      });
    }
    next();
  };
}

module.exports = {
  authorizeCapability,
};
