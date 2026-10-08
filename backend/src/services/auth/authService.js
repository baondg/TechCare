const bcrypt = require('bcrypt');
const authAccountRepository = require('../../repositories/authAccountRepository');
const sessionRepository = require('../../repositories/sessionRepository');
const systemConfigRepository = require('../../repositories/systemConfigRepository');
const { normalizeRoleFromCode } = require('../../security/roleMapping');
const { isAccountStatusActive } = require('../../common/accountStatus');
const { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } = require('../../errors/AppError');
const { hashPassword, validatePasswordStrength } = require('./passwordPolicy');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('./tokens');

const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const REMEMBER_ME_DAYS = 7;

/** Positive integer from SYSTEM_CONFIGURATION, or `fallback` — also when config storage is unavailable. */
async function getNumericConfig(key, fallback) {
  try {
    const parsed = Number.parseInt(String(await systemConfigRepository.getValue(key)), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch (_error) {
    // Fail open for the auth flow when optional config storage is unavailable.
    return fallback;
  }
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function minutesFromNow(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

/** Public part of an account, as the client stores it. */
function accountSummary(account) {
  return {
    id: account.user_id,
    username: account.username,
    type: account.type,
    mustChangePassword: Boolean(account.must_change_password),
  };
}

/**
 * Checks credentials and opens a new session (any previous session of the user is closed).
 * The session lasts `sessionTimeoutMinutes` (system config), or 7 days with `rememberMe`.
 * @param {{ ipAddress?: string, userAgent?: string }} client
 * @returns {Promise<{ user, token, refreshToken, expiresAt: Date }>}
 */
async function login({ username, password, rememberMe = false }, client) {
  const account = await authAccountRepository.findAccountForLogin(username);
  if (!account) throw new UnauthorizedError('Invalid email or password');
  if (!(await bcrypt.compare(password, account.password))) {
    throw new UnauthorizedError('Invalid username or password.');
  }

  // Only after a correct password: reveal the deactivated state (same rules as authMiddleware).
  const rawStatus = account.getDataValue ? account.getDataValue('status') : account.status;
  if (!isAccountStatusActive(rawStatus)) {
    throw new ForbiddenError(
      'This account has been deactivated. Please contact your administrator if you need access.',
      { code: 'ACCOUNT_DEACTIVATED' }
    );
  }

  await sessionRepository.deleteExpiredSessions();
  const timeoutMinutes = await getNumericConfig('sessionTimeoutMinutes', DEFAULT_SESSION_TIMEOUT_MINUTES);
  // One session per user: logging in elsewhere ends the previous one.
  await sessionRepository.deleteSessionsOfUser(account.user_id);

  const token = generateAccessToken(username, account.user_id, account.type);
  const refreshToken = generateRefreshToken(username, account.user_id);
  const expiresAt = rememberMe ? daysFromNow(REMEMBER_ME_DAYS) : minutesFromNow(timeoutMinutes);
  await sessionRepository.createSession({
    userId: account.user_id,
    token,
    refreshToken,
    expiresAt,
    lastActivity: new Date(),
    ipAddress: client.ipAddress,
    userAgent: client.userAgent,
  });

  try {
    await authAccountRepository.recordLastLogin(account);
  } catch (_error) {
    // Legacy schemas have no last_login column.
  }

  const profile = account.User;
  return {
    user: {
      id: account.user_id,
      username: account.username,
      firstName: profile?.first_name,
      lastName: profile?.last_name,
      fullName: profile ? `${profile.last_name || ''} ${profile.first_name || ''}`.trim() : null,
      type: account.type,
      // Normalized role name for RBAC capability checks on the client.
      role: normalizeRoleFromCode(account.type) || 'patient',
      // Admin-issued password: the client sends the user to the change-password screen.
      mustChangePassword: Boolean(account.must_change_password),
    },
    token,
    refreshToken,
    expiresAt,
  };
}

/** Opens the first session of a just-created account (7 days). */
async function startSessionForNewAccount(account) {
  const token = generateAccessToken(account.username, account.user_id, account.type);
  const refreshToken = generateRefreshToken(account.username, account.user_id);
  const expiresAt = daysFromNow(REMEMBER_ME_DAYS);
  await sessionRepository.createSession({
    userId: account.user_id,
    token,
    refreshToken,
    expiresAt,
    lastActivity: new Date(),
  });
  return { user: accountSummary(account), token, refreshToken, expiresAt };
}

/**
 * Ends the current session (by access token, else by refresh token) or, with `allDevices`,
 * every session of the user.
 */
async function logout({ userId, token, refreshToken, allDevices }) {
  if (allDevices && userId) {
    await sessionRepository.deleteSessionsOfUser(userId);
  } else if (token) {
    await sessionRepository.deleteSessionByToken(token);
  } else if (refreshToken) {
    await sessionRepository.deleteSessionByRefreshToken(refreshToken);
  }
}

/**
 * Exchanges a refresh token for a new access token and rotates the refresh token.
 * Throws Forbidden / NotFound when the token, its session or its account is no longer valid.
 * @returns {Promise<{ user, token, refreshToken, expiresAt }>}
 */
async function refresh(currentRefreshToken) {
  const decoded = verifyRefreshToken(currentRefreshToken);
  if (!decoded) throw new ForbiddenError('Invalid or expired refresh token');

  const session = await sessionRepository.findSessionByRefreshToken(currentRefreshToken, decoded.userId);
  if (!session) throw new ForbiddenError('Session not found or expired');
  if (new Date() > new Date(session.expiresAt)) {
    await sessionRepository.deleteSession(session.id);
    throw new ForbiddenError('Session expired. Please login again.');
  }

  const account = await authAccountRepository.findAccountByUserId(decoded.userId);
  if (!account) throw new NotFoundError('User not found');

  const token = generateAccessToken(account.username, account.user_id, account.type);
  const refreshToken = generateRefreshToken(account.username, account.user_id);
  await sessionRepository.updateSession(session, { token, refreshToken, lastActivity: new Date() });
  return { user: accountSummary(account), token, refreshToken, expiresAt: session.expiresAt };
}

/** The signed-in account and its unexpired sessions. */
async function getSessionInfo(userId) {
  const account = await authAccountRepository.findAccountByUserId(userId);
  if (!account) throw new NotFoundError('User not found');
  const sessions = await sessionRepository.listActiveSessionsOfUser(account.user_id);
  return { user: accountSummary(account), sessions: sessions.map((s) => s.toJSON()) };
}

/**
 * Replaces the signed-in user's password and clears the forced-change flag. Every other session
 * of the user ends; the current one stays. Errors are 400 (a 401 would log the client out).
 */
async function changePassword({ userId, sessionId }, { currentPassword, newPassword }) {
  const account = await authAccountRepository.findAccountByUserId(userId);
  if (!account) throw new NotFoundError('User not found');
  if (!(await bcrypt.compare(currentPassword, account.password))) {
    throw new BadRequestError('Current password is incorrect', { code: 'WRONG_PASSWORD' });
  }
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) throw new BadRequestError(strength.error);
  if (newPassword === currentPassword) {
    throw new BadRequestError('New password must be different from the current password');
  }

  await authAccountRepository.updatePassword(account, await hashPassword(newPassword), { mustChange: false });
  await sessionRepository.deleteOtherSessionsOfUser(userId, sessionId);
}

module.exports = { login, startSessionForNewAccount, logout, refresh, getSessionInfo, changePassword };
