const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const logger = require('../../common/logger');
const { ACCOUNT_ROLE_LABEL } = require('./roleLabels');

function mapFeedbackRow(r) {
  const fullName = String(r.userName || '').trim();
  return {
    id: Number(r.id),
    userId: Number(r.userId),
    username: r.username || '',
    userName: fullName || r.username || `User #${r.userId}`,
    roleCode: r.roleCode || '',
    role: ACCOUNT_ROLE_LABEL[r.roleCode] || r.roleCode || 'Unknown',
    type: r.type || 'general',
    content: r.content || '',
    rating: Number(r.rating || 0),
    time: r.time || null,
    status: r.status === 1 || r.status === true || r.status === '1',
    response: r.response || '',
  };
}

exports.getFeedbacks = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.type,
         f.content,
         f.rating,
         f.time,
         f.status,
         f.response,
         a.username,
         a.type AS roleCode,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS userName
       FROM FEEDBACK f
       LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
       LEFT JOIN USER u ON u.id = f.user_id
       ORDER BY f.time DESC, f.id DESC`,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      feedbacks: (rows || []).map(mapFeedbackRow),
    });
  } catch (error) {
    logger.error({ err: error }, 'Get admin feedbacks error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateFeedback = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid feedback id' });
    }

    const hasResponse = Object.prototype.hasOwnProperty.call(req.body || {}, 'response');
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body || {}, 'status');
    if (!hasResponse && !hasStatus) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const updates = [];
    const replacements = { id };
    if (hasResponse) {
      updates.push('response = :response');
      replacements.response = String(req.body?.response || '').trim() || null;
    }
    if (hasStatus) {
      updates.push('status = :status');
      replacements.status = req.body?.status ? 1 : 0;
    }

    const [existing] = await sequelize.query(
      'SELECT id FROM FEEDBACK WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    await sequelize.query(
      `UPDATE FEEDBACK
       SET ${updates.join(', ')}
       WHERE id = :id`,
      { replacements, type: QueryTypes.UPDATE }
    );

    const [updated] = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.type,
         f.content,
         f.rating,
         f.time,
         f.status,
         f.response,
         a.username,
         a.type AS roleCode,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS userName
       FROM FEEDBACK f
       LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
       LEFT JOIN USER u ON u.id = f.user_id
       WHERE f.id = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, feedback: mapFeedbackRow(updated) });
  } catch (error) {
    logger.error({ err: error }, 'Update admin feedback error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
