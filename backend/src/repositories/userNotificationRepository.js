const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

async function countUnreadDueNotifications(userId) {
  const [c] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM NOTIFICATION
     WHERE user_id = :userId AND \`time\` <= NOW() AND status = 'unread'`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return Number(c?.n) || 0;
}

async function listDueNotificationsForUser(userId, limit = 100) {
  return sequelize.query(
    `SELECT id, \`type\`, content, \`time\`, status
     FROM NOTIFICATION
     WHERE user_id = :userId AND \`time\` <= NOW()
     ORDER BY \`time\` DESC
     LIMIT :limit`,
    { replacements: { userId, limit }, type: QueryTypes.SELECT }
  );
}

async function markAllNotificationsReadForUser(userId) {
  await sequelize.query(
    `UPDATE NOTIFICATION SET status = 'read'
     WHERE user_id = :userId AND status = 'unread'`,
    { replacements: { userId }, type: QueryTypes.UPDATE }
  );
}

async function markNotificationReadForUser(id, userId) {
  await sequelize.query(
    `UPDATE NOTIFICATION SET status = 'read'
     WHERE id = :id AND user_id = :userId`,
    { replacements: { id, userId }, type: QueryTypes.UPDATE }
  );
}

module.exports = {
  countUnreadDueNotifications,
  listDueNotificationsForUser,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
};
