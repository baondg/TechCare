const notificationService = require('../services/notificationService');
const logger = require('../common/logger');

function resolveUserId(req) {
  const raw = req.user?.userId ?? req.user?.id;
  const userId = Number(raw);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

/**
 * GET /api/notifications/unread-count
 * Lightweight poll target for notification badges (same filter as list).
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { count } = await notificationService.getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, 'Unread count error');
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/notifications
 * Lists notifications that are already due (time <= NOW) for the logged-in user.
 */
exports.listNotifications = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const payload = await notificationService.listNotifications(userId);
    res.json(payload);
  } catch (error) {
    logger.error({ err: error }, 'List notifications error');
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATCH /api/notifications/read-all
 */
exports.markAllNotificationsRead = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const payload = await notificationService.markAllRead(userId);
    res.json(payload);
  } catch (error) {
    logger.error({ err: error }, 'Mark all notifications read error');
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATCH /api/notifications/:id/read
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const id = Number(req.params.id);
    const out = await notificationService.markOneRead(userId, id);
    if (!out.ok) {
      return res.status(out.status).json(out.json);
    }
    res.json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Mark notification read error');
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
