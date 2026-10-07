const logger = require('../common/logger');
function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required');
  }
  if (!secret) {
    // Dev-only fallback to keep local server bootable.
    logger.warn('[auth] JWT_SECRET missing; using insecure development fallback secret');
    return 'dev-insecure-jwt-secret';
  }
  return secret;
}

module.exports = {
  getJwtSecret,
};
