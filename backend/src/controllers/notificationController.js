const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * GET /api/notifications
 * Get all notifications for the current user
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const rows = await sequelize.query(
      `SELECT id, title, message, type, is_read AS isRead, related_id AS relatedId, created_at AS createdAt
       FROM NOTIFICATION
       WHERE user_id = :userId
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { userId, limit: Number(limit), offset: Number(offset) }, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM NOTIFICATION WHERE user_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      notifications: rows,
      total: countRow?.total || 0,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [row] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM NOTIFICATION WHERE user_id = :userId AND is_read = 0`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: Number(row?.count || 0) });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    await sequelize.query(
      `UPDATE NOTIFICATION SET is_read = 1 WHERE id = :id AND user_id = :userId`,
      { replacements: { id, userId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await sequelize.query(
      `UPDATE NOTIFICATION SET is_read = 1 WHERE user_id = :userId AND is_read = 0`,
      { replacements: { userId }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Mark all as read error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
