const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../security/jwtConfig');
const { config } = require('../config/env');

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token

const REFRESH_TOKEN_EXPIRY = '7d'; // Long-lived refresh token

const REFRESH_COOKIE_NAME = 'refreshToken';

// Generate tokens
const generateAccessToken = (username, userId, role) =>
  jwt.sign({ username, userId, role, type: 'access' }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = (username, userId) =>
  jwt.sign({ username, userId, type: 'refresh' }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });

const resolveSameSite = () => {
  const raw = config.auth.refreshCookieSameSite;
  if (raw === 'lax' || raw === 'strict' || raw === 'none') return raw;
  return config.isProduction ? 'none' : 'lax';
};

const shouldUseSecureCookies = () => {
  if (config.auth.refreshCookieSecure !== undefined) {
    return config.auth.refreshCookieSecure;
  }
  return config.isProduction;
};

const getRefreshCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: resolveSameSite(),
  path: '/api/auth',
  expires: expiresAt,
});

const setRefreshCookie = (res, refreshToken, expiresAt) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...getRefreshCookieOptions(new Date(0)),
    expires: new Date(0),
  });
};

const getRefreshTokenFromRequest = (req) => {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (fromCookie) return String(fromCookie);
  const fromBody = req.body?.refreshToken;
  if (fromBody) return String(fromBody);
  return null;
};

module.exports = {
  clearRefreshCookie,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenFromRequest,
  setRefreshCookie,
};
