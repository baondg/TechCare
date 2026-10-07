const crypto = require('crypto');
const logger = require('../common/logger');
const { config } = require('../config/env');

const INTERNAL_API_SECRET_HEADER = 'x-internal-api-secret';

function requireInternalApiSecret(req, res, next) {
  const secret = config.auth.internalApiSecret;
  if (!secret) {
    if (config.isProduction) {
      logger.error('[security] INTERNAL_API_SECRET is required in production for internal AI routes');
      return res.status(500).json({
        error: 'Server misconfiguration',
        hint: 'Set INTERNAL_API_SECRET (e.g. Secret Manager techcare-internal-api-secret) for Cloud Run.',
      });
    }
    return next();
  }

  const provided = String(req.get(INTERNAL_API_SECRET_HEADER) || '').trim();
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    if (!crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } catch (_e) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

exports.requireInternalApiSecret = requireInternalApiSecret;
exports.INTERNAL_API_SECRET_HEADER = INTERNAL_API_SECRET_HEADER;