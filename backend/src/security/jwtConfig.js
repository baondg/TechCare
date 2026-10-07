const logger = require('../common/logger');
const { config } = require('../config/env');

function getJwtSecret() {
  const secret = config.auth.jwtSecret;
  if (!secret && config.isProduction) {
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
