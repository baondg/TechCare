const notificationService = require('../services/notificationService');
const { asyncHandler } = require('../common/asyncHandler');
const { UnauthorizedError } = require('../errors/AppError');

function requireUserId(req) {
  const userId = Number(req.user?.userId ?? req.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

/**
 * GET /api/notifications/unread-count
 * Lightweight poll target for notification badges (same filter as list).
 */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const { count } = await notificationService.getUnreadCount(requireUserId(req));
  res.json({ count });
});

/**
 * GET /api/notifications
 * Lists notifications that are already due (time <= NOW) for the logged-in user.
 */
exports.listNotifications = asyncHandler(async (req, res) => {
  res.json(await notificationService.listNotifications(requireUserId(req)));
});

/**
 * PATCH /api/notifications/read-all
 */
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllRead(requireUserId(req)));
});

/**
 * PATCH /api/notifications/:id/read
 */
exports.markNotificationRead = asyncHandler(async (req, res) => {
  const out = await notificationService.markOneRead(requireUserId(req), req.params.id);
  res.status(out.status).json(out.json);
});
