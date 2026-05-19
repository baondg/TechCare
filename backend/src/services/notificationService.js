const userNotificationRepository = require('../repositories/userNotificationRepository');

async function getUnreadCount(userId) {
  const count = await userNotificationRepository.countUnreadDueNotifications(userId);
  return { count };
}

async function listNotifications(userId) {
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
