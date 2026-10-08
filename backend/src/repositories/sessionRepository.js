const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../common/database');
const Session = require('../models/Session');

/** Unexpired sessions with the owner's role code, most recently active first (max 500). */
async function listActiveSessions() {
  return sequelize.query(
    `SELECT
         s.id,
         s.userId,
         s.lastActivity,
         s.expiresAt,
         s.ipAddress,
         s.userAgent,
         COALESCE(a.type, '') AS roleCode
       FROM SESSION s
       LEFT JOIN ACCOUNT a ON a.user_id = s.userId
       WHERE s.expiresAt > NOW()
       ORDER BY s.lastActivity DESC
       LIMIT 500`,
    { type: QueryTypes.SELECT }
  );
}

/** A user's unexpired sessions, most recently active first. */
async function listActiveSessionsOfUser(userId) {
  return Session.findAll({
    where: {
      userId,
      expiresAt: { [Op.gt]: new Date() },
    },
    attributes: ['id', 'lastActivity', 'ipAddress', 'userAgent', 'expiresAt'],
    order: [['lastActivity', 'DESC']],
  });
}

/** @returns {Promise<Session | null>} the session holding this access token for this user */
async function findSessionByAccessToken(token, userId) {
  return Session.findOne({ where: { token, userId } });
}

/** @returns {Promise<number>} sessions not yet expired */
async function countActiveSessions() {
  return Session.count({ where: { expiresAt: { [Op.gt]: new Date() } } });
}

/** @returns {Promise<Session | null>} the session holding this refresh token for this user */
async function findSessionByRefreshToken(refreshToken, userId) {
  return Session.findOne({ where: { refreshToken, userId } });
}

/** @param values { userId, token, refreshToken, expiresAt, lastActivity, ipAddress?, userAgent? } */
async function createSession(values) {
  return Session.create(values);
}

/** @param session a Session instance from this repository */
async function updateSession(session, changes) {
  await session.update(changes);
}

async function deleteExpiredSessions() {
  return Session.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
}

async function deleteSessionByToken(token) {
  return Session.destroy({ where: { token } });
}

async function deleteSessionByRefreshToken(refreshToken) {
  return Session.destroy({ where: { refreshToken } });
}

/** @returns {Promise<{ id, userId } | null>} */
async function findSessionOwner(id) {
  return Session.findOne({ where: { id }, attributes: ['id', 'userId'] });
}

/** @returns {Promise<number>} rows deleted */
async function deleteSession(id) {
  return Session.destroy({ where: { id } });
}

/** @returns {Promise<number>} rows deleted */
async function deleteSessionsOfUser(userId) {
  return Session.destroy({ where: { userId } });
}

/** @returns {Promise<number>} rows deleted — every session of the user but `keepSessionId` */
async function deleteOtherSessionsOfUser(userId, keepSessionId) {
  return Session.destroy({ where: { userId, id: { [Op.ne]: keepSessionId } } });
}

/** Deletes every session whose owner is not in `userIds` (every session when it is empty). */
async function deleteSessionsExceptUsers(userIds) {
  return Session.destroy({ where: userIds.length > 0 ? { userId: { [Op.notIn]: userIds } } : {} });
}

module.exports = {
  listActiveSessions,
  listActiveSessionsOfUser,
  findSessionByAccessToken,
  countActiveSessions,
  findSessionByRefreshToken,
  createSession,
  updateSession,
  deleteExpiredSessions,
  deleteSessionByToken,
  deleteSessionByRefreshToken,
  findSessionOwner,
  deleteSession,
  deleteSessionsOfUser,
  deleteOtherSessionsOfUser,
  deleteSessionsExceptUsers,
};
