/** Refresh-token cookie handling (HTTP only; tokens are issued by services/auth/tokens). */
const { config } = require('../config/env');

const REFRESH_COOKIE_NAME = 'refreshToken';

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
  getRefreshTokenFromRequest,
  setRefreshCookie,
};
