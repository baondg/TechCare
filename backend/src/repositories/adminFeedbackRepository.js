const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** FEEDBACK joined with its author's account (role) and display name. */
const FEEDBACK_WITH_AUTHOR_SQL = `SELECT
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
       LEFT JOIN USER u ON u.id = f.user_id`;

async function listFeedbacksWithAuthor() {
  return sequelize.query(
    `${FEEDBACK_WITH_AUTHOR_SQL}
       ORDER BY f.time DESC, f.id DESC`,
    { type: QueryTypes.SELECT }
  );
}

async function findFeedbackWithAuthor(id) {
  const [row] = await sequelize.query(
    `${FEEDBACK_WITH_AUTHOR_SQL}
       WHERE f.id = :id
       LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row || null;
}

async function feedbackExists(id) {
  const [row] = await sequelize.query('SELECT id FROM FEEDBACK WHERE id = :id LIMIT 1', {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return !!row;
}

/**
 * Sets the admin response and/or the handled flag. Only keys present in `changes` are written.
 * @param {{ response?: string | null, status?: 0 | 1 }} changes
 */
async function updateFeedback(id, changes) {
  const updates = [];
  const replacements = { id };
  if ('response' in changes) {
    updates.push('response = :response');
    replacements.response = changes.response;
  }
  if ('status' in changes) {
    updates.push('status = :status');
    replacements.status = changes.status;
  }
  if (!updates.length) return;
  await sequelize.query(
    `UPDATE FEEDBACK
       SET ${updates.join(', ')}
       WHERE id = :id`,
    { replacements, type: QueryTypes.UPDATE }
  );
}

module.exports = {
  listFeedbacksWithAuthor,
  findFeedbackWithAuthor,
  feedbackExists,
  updateFeedback,
};
