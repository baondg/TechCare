const { isRoleAllowed } = require('../security/rbacMatrix');

function authorizeCapability(capability) {
  return function capabilityGuard(req, res, next) {
    const role = req?.user?.role;
    if (!isRoleAllowed(capability, role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        capability,
      });
    }
    next();
  };
}

module.exports = {
  authorizeCapability,
};
