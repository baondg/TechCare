const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * GET /api/notifications
 * Lists notifications that are already due (time <= NOW) for the logged-in user.
 */
exports.listNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await sequelize.query(
      `SELECT id, \`type\`, content, \`time\`, status
       FROM NOTIFICATION
       WHERE user_id = :userId AND \`time\` <= NOW()
       ORDER BY \`time\` DESC
       LIMIT 100`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    const [c] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM NOTIFICATION
       WHERE user_id = :userId AND \`time\` <= NOW() AND status = 'unread'`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    res.json({
      success: true,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        time: r.time,
        status: r.status,
      })),
      unreadCount: Number(c?.n) || 0,
    });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATCH /api/notifications/:id/read
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    await sequelize.query(
      `UPDATE NOTIFICATION SET status = 'read'
       WHERE id = :id AND user_id = :userId`,
      { replacements: { id, userId }, type: QueryTypes.UPDATE }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
