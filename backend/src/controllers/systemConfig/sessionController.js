const sequelize = require('../../common/database');
const Session = require('../../models/Session');
const { Op } = require('sequelize');

const getAccountRoleCodeByUserId = async (userId) => {
  const [row] = await sequelize.query(
    'SELECT type FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
  );
  return row?.type ? String(row.type).trim().toUpperCase() : '';
};

exports.getSessions = async (req, res) => {
  try {
    const sessions = await sequelize.query(
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
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid session id' });
    }

    const session = await Session.findOne({ where: { id }, attributes: ['id', 'userId'] });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const targetUserId = Number(session.userId);
    const currentUserId = Number(req.user?.userId);
    if (Number.isFinite(currentUserId) && currentUserId > 0 && targetUserId === currentUserId) {
      return res.status(403).json({ success: false, error: 'Cannot revoke your own session.' });
    }

    const targetRoleCode = await getAccountRoleCodeByUserId(targetUserId);
    if (targetRoleCode === 'ADM') {
      return res.status(403).json({ success: false, error: 'Cannot revoke admin sessions.' });
    }

    const deleted = await Session.destroy({ where: { id: session.id } });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    return res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.revokeAllSessions = async (req, res) => {
  try {
    const rawUserId = req.body?.userId;
    let where = {};
    if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
      const userId = Number(rawUserId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid userId' });
      }
      const currentUserId = Number(req.user?.userId);
      if (Number.isFinite(currentUserId) && currentUserId > 0 && userId === currentUserId) {
        return res.status(403).json({ success: false, error: 'Cannot revoke your own sessions.' });
      }
      const targetRoleCode = await getAccountRoleCodeByUserId(userId);
      if (targetRoleCode === 'ADM') {
        return res.status(403).json({ success: false, error: 'Cannot revoke admin sessions.' });
      }
      where = { userId };
    } else {
      const adminUserRows = await sequelize.query(
        "SELECT user_id AS userId FROM ACCOUNT WHERE type = 'ADM'",
        { type: sequelize.QueryTypes.SELECT }
      );
      const adminUserIds = adminUserRows
        .map((row) => Number(row.userId))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (adminUserIds.length > 0) {
        where = { userId: { [Op.notIn]: adminUserIds } };
      }
    }

    const deleted = await Session.destroy({ where });
    return res.json({
      success: true,
      message: 'Sessions revoked successfully',
      revokedCount: deleted,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
