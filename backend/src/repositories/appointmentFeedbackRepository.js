const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

async function listFeedbackForUser(userId) {
  return sequelize.query(
    `SELECT
       f.id,
       f.user_id AS userId,
       f.content,
       f.type,
       f.time,
       f.status,
       f.rating,
       f.response
     FROM FEEDBACK f
     WHERE f.user_id = :userId
     ORDER BY f.time DESC, f.id DESC`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
}

async function listFeedbackVisibleApproved() {
  return sequelize.query(
    `SELECT
       f.id,
       f.user_id AS userId,
       f.content,
       f.type,
       f.time,
       f.status,
       f.rating,
       f.response,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('User #', f.user_id)) AS userName
     FROM FEEDBACK f
     LEFT JOIN USER u ON u.id = f.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
     WHERE f.status = 1
     ORDER BY f.time DESC, f.id DESC`,
    { type: QueryTypes.SELECT }
  );
}

async function insertFeedbackRow({ userId, content, type, rating }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO FEEDBACK (user_id, content, type, rating, status)
     VALUES (:userId, :content, :type, :rating, 1)`,
    {
      replacements: { userId, content, type, rating },
      type: QueryTypes.INSERT,
    }
  );
  return insertId;
}

async function selectFeedbackById(id) {
  const [row] = await sequelize.query(
    `SELECT id, user_id AS userId, content, type, time, status, rating, response
     FROM FEEDBACK
     WHERE id = :id
     LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row;
}

module.exports = {
  listFeedbackForUser,
  listFeedbackVisibleApproved,
  insertFeedbackRow,
  selectFeedbackById,
};
