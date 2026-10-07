const authService = require('../services/auth/authService');
const { asyncHandler } = require('../common/asyncHandler');
const { AppError, BadRequestError } = require('../errors/AppError');
const { clearRefreshCookie, getRefreshTokenFromRequest, setRefreshCookie } = require('./sessionTokens');

/** POST /api/auth/login — body validated by `loginBody`. */
exports.login = asyncHandler(async (req, res) => {
  const { username, password, rememberMe } = req.body;
  const session = await authService.login(
    { username, password, rememberMe: !!rememberMe },
    { ipAddress: req.ip || req.connection?.remoteAddress, userAgent: req.headers['user-agent'] }
  );
  setRefreshCookie(res, session.refreshToken, session.expiresAt);
  res.json({
    success: true,
    user: session.user,
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  });
});

/** POST /api/auth/logout — `{ allDevices? }`; this device by default. */
exports.logout = asyncHandler(async (req, res) => {
  const allDevices = req.body?.allDevices || false;
  await authService.logout({
    userId: req.user?.userId,
    token: req.headers.authorization?.replace('Bearer ', '') || req.body?.token,
    refreshToken: getRefreshTokenFromRequest(req),
    allDevices,
  });
  clearRefreshCookie(res);
  res.json({
    success: true,
    message: allDevices ? 'Logged out from all devices' : 'Logged out successfully',
  });
});

/** POST /api/auth/refresh — refresh token from the cookie (or body); rotates it. */
exports.refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) throw new BadRequestError('Refresh token is required');

  let session;
  try {
    session = await authService.refresh(refreshToken);
  } catch (error) {
    // The cookie is dead (bad token, session gone or expired, account gone): drop it.
    if (error instanceof AppError) clearRefreshCookie(res);
    throw error;
  }
  setRefreshCookie(res, session.refreshToken, session.expiresAt);
  res.json({ success: true, token: session.token, user: session.user });
});

/** GET /api/auth/session — current account and its active sessions. */
exports.getSession = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await authService.getSessionInfo(req.user.userId)) });
});
