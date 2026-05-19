const crypto = require('crypto');

/**
 * Assigns req.requestId and echoes X-Request-ID (accepts incoming header if sane).
 */
function requestIdMiddleware(req, res, next) {
  const incoming = String(req.get('x-request-id') || '').trim();
  const id =
    incoming.length >= 8 && incoming.length <= 128 && /^[\w-]+$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestIdMiddleware };