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

/** Deletes every session whose owner is not in `userIds` (every session when it is empty). */
async function deleteSessionsExceptUsers(userIds) {
  return Session.destroy({ where: userIds.length > 0 ? { userId: { [Op.notIn]: userIds } } : {} });
}

module.exports = {
  listActiveSessions,
  findSessionOwner,
  deleteSession,
  deleteSessionsOfUser,
  deleteSessionsExceptUsers,
};
