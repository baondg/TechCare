const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** @returns {Promise<{ totalUsers, activeUsers } | undefined>} */
async function getAccountTotals() {
  const [row] = await sequelize.query(
    `SELECT
         COUNT(*) AS totalUsers,
         SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS activeUsers
       FROM ACCOUNT`,
    { type: QueryTypes.SELECT }
  );
  return row;
}

async function countAccountsByRole() {
  return sequelize.query(
    `SELECT type, COUNT(*) AS total
       FROM ACCOUNT
       GROUP BY type
       ORDER BY total DESC`,
    { type: QueryTypes.SELECT }
  );
}

async function listRecentAccounts() {
  return sequelize.query(
    `SELECT
         a.user_id AS id,
         a.username,
         a.type,
         a.status,
         a.created_time AS createdTime
       FROM ACCOUNT a
       ORDER BY a.created_time DESC, a.user_id DESC
       LIMIT 6`,
    { type: QueryTypes.SELECT }
  );
}

/** @returns {Promise<{ total, pending, averageRating } | undefined>} */
async function getFeedbackTotals() {
  const [row] = await sequelize.query(
    `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN f.status = 0 OR f.status = '0' THEN 1 ELSE 0 END) AS pending,
         ROUND(AVG(NULLIF(f.rating, 0)), 1) AS averageRating
       FROM FEEDBACK f`,
    { type: QueryTypes.SELECT }
  );
  return row;
}

/** Account sign-ups per day over the 7 days ending `clinicToday` (YYYY-MM-DD); days with none are absent. */
async function countSignupsByDay(clinicToday) {
  return sequelize.query(
    `SELECT DATE(a.created_time) AS day, COUNT(*) AS count
       FROM ACCOUNT a
       WHERE DATE(a.created_time) >= DATE_SUB(:clinicToday, INTERVAL 6 DAY)
         AND DATE(a.created_time) <= :clinicToday
       GROUP BY DATE(a.created_time)
       ORDER BY day ASC`,
    { replacements: { clinicToday }, type: QueryTypes.SELECT }
  );
}

async function isDatabaseReachable() {
  const rows = await sequelize.query('SELECT 1 AS ok', { type: QueryTypes.SELECT });
  return !!rows?.[0];
}

module.exports = {
  getAccountTotals,
  countAccountsByRole,
  listRecentAccounts,
  getFeedbackTotals,
  countSignupsByDay,
  isDatabaseReachable,
};
