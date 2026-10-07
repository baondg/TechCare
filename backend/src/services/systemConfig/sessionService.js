const sessionRepository = require('../../repositories/sessionRepository');
const accountRepository = require('../../repositories/accountRepository');
const { ForbiddenError, NotFoundError } = require('../../errors/AppError');

function isSameUser(targetUserId, currentUserId) {
  const current = Number(currentUserId);
  return Number.isFinite(current) && current > 0 && Number(targetUserId) === current;
}

async function assertNotAdmin(userId) {
  if ((await accountRepository.getAccountRoleCode(userId)) === 'ADM') {
    throw new ForbiddenError('Cannot revoke admin sessions.');
  }
}

async function listActiveSessions() {
  return sessionRepository.listActiveSessions();
}

/** Revokes one session. Admins cannot revoke their own session or another admin's. */
async function revokeSession(id, currentUserId) {
  const session = await sessionRepository.findSessionOwner(id);
  if (!session) throw new NotFoundError('Session not found');
  if (isSameUser(session.userId, currentUserId)) {
    throw new ForbiddenError('Cannot revoke your own session.');
  }
  await assertNotAdmin(Number(session.userId));
  if (!(await sessionRepository.deleteSession(session.id))) {
    throw new NotFoundError('Session not found');
  }
}

/**
 * Revokes every session of `userId`, or — when it is undefined — every non-admin session.
 * @returns {Promise<number>} sessions revoked
 */
async function revokeAllSessions(userId, currentUserId) {
  if (userId === undefined) {
    return sessionRepository.deleteSessionsExceptUsers(await accountRepository.listAdminUserIds());
  }
  if (isSameUser(userId, currentUserId)) {
    throw new ForbiddenError('Cannot revoke your own sessions.');
  }
  await assertNotAdmin(userId);
  return sessionRepository.deleteSessionsOfUser(userId);
}

module.exports = { listActiveSessions, revokeSession, revokeAllSessions };
