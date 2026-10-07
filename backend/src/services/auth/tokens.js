const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../security/jwtConfig');

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d'; // Long-lived refresh token

const generateAccessToken = (username, userId, role) =>
  jwt.sign({ username, userId, role, type: 'access' }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = (username, userId) =>
  jwt.sign({ username, userId, type: 'refresh' }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });

/** Decoded payload of a valid, unexpired refresh token; null for anything else. */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return decoded?.type === 'refresh' ? decoded : null;
  } catch (_error) {
    return null;
  }
}

module.exports = { generateAccessToken, generateRefreshToken, verifyRefreshToken };
