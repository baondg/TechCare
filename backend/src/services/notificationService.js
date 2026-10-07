const userNotificationRepository = require('../repositories/userNotificationRepository');
const logger = require('../common/logger');

function isDbUnavailableError(error) {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  return (
    error?.name === 'SequelizeConnectionError' ||
    error?.name === 'SequelizeConnectionRefusedError' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_BAD_FIELD_ERROR'
  );
}

function emptyInboxPayload() {
  return { success: true, notifications: [], unreadCount: 0, degraded: true };
}

async function getUnreadCount(userId) {
  try {
    const count = await userNotificationRepository.countUnreadDueNotifications(userId);
    return { count };
  } catch (error) {
    if (isDbUnavailableError(error)) {
      logger.warn({ err: error }, '[notifications] DB unavailable for unread count');
      return { count: 0, degraded: true };
    }
    throw error;
  }
}

async function listNotifications(userId) {
  try {
    const rows = await userNotificationRepository.listDueNotificationsForUser(userId, 100);
    const unreadCount = await userNotificationRepository.countUnreadDueNotifications(userId);
    return {
      success: true,
      notifications: (rows || []).map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        time: r.time,
        status: r.status,
      })),
      unreadCount,
    };
  } catch (error) {
    if (isDbUnavailableError(error)) {
      logger.warn({ err: error }, '[notifications] DB unavailable for list');
      return emptyInboxPayload();
    }
    throw error;
  }
}

async function markAllRead(userId) {
  await userNotificationRepository.markAllNotificationsReadForUser(userId);
  return { success: true };
}

async function markOneRead(userId, id) {
  if (!Number.isFinite(id)) {
    return { ok: false, status: 400, json: { success: false, message: 'Invalid id' } };
  }
  await userNotificationRepository.markNotificationReadForUser(id, userId);
  return { ok: true, status: 200, json: { success: true } };
}

module.exports = {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markOneRead,
};
