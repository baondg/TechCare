const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { getClinicTodayYmd, getClinicTimezone, getClinicTzOffset } = require('../../common/clinicDate');
const logger = require('../../common/logger');
const { ACCOUNT_ROLE_LABEL } = require('./roleLabels');

function buildSignupsByDay(clinicToday, signupRows) {
  const countByDay = new Map();
  for (const row of signupRows || []) {
    const raw = row.day;
    const key =
      raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : String(raw || '').slice(0, 10);
    if (key) countByDay.set(key, Number(row.count || 0));
  }

  const tz = getClinicTimezone();
  const offset = getClinicTzOffset();
  const base = new Date(`${clinicToday}T12:00:00${offset}`);
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(base.getTime() - i * 86400000);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    days.push({ date, count: countByDay.get(date) ?? 0 });
  }
  return days;
}

exports.getDashboardSummary = async (req, res) => {
  try {
    const [countRow] = await sequelize.query(
      `SELECT
         COUNT(*) AS totalUsers,
         SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS activeUsers
       FROM ACCOUNT`,
      { type: QueryTypes.SELECT }
    );

    const roleRows = await sequelize.query(
      `SELECT type, COUNT(*) AS total
       FROM ACCOUNT
       GROUP BY type
       ORDER BY total DESC`,
      { type: QueryTypes.SELECT }
    );

    const recentRows = await sequelize.query(
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

    const clinicToday = getClinicTodayYmd();

    const [feedbackRow] = await sequelize.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN f.status = 0 OR f.status = '0' THEN 1 ELSE 0 END) AS pending,
         ROUND(AVG(NULLIF(f.rating, 0)), 1) AS averageRating
       FROM FEEDBACK f`,
      { type: QueryTypes.SELECT }
    );

    const signupRows = await sequelize.query(
      `SELECT DATE(a.created_time) AS day, COUNT(*) AS count
       FROM ACCOUNT a
       WHERE DATE(a.created_time) >= DATE_SUB(:clinicToday, INTERVAL 6 DAY)
         AND DATE(a.created_time) <= :clinicToday
       GROUP BY DATE(a.created_time)
       ORDER BY day ASC`,
      { replacements: { clinicToday }, type: QueryTypes.SELECT }
    );

    const dbHealthRows = await sequelize.query('SELECT 1 AS ok', { type: QueryTypes.SELECT });
    const dbConnected = !!dbHealthRows?.[0];
    const totalUsers = Number(countRow?.totalUsers || 0);
    const activeUsers = Number(countRow?.activeUsers || 0);
    const inactiveUsers = Math.max(0, totalUsers - activeUsers);

    const roleBreakdown = roleRows.map((r) => ({
      roleCode: String(r.type || ''),
      roleLabel: ACCOUNT_ROLE_LABEL[r.type] || String(r.type || ''),
      total: Number(r.total || 0),
    }));

    const recentActivity = recentRows.map((r) => ({
      id: Number(r.id),
      message: `Account '${r.username || `#${r.id}`}' (${ACCOUNT_ROLE_LABEL[r.type] || r.type}) created`,
      createdTime: r.createdTime || null,
      status: r.status === 1 || r.status === true || r.status === '1' ? 'Enabled' : 'Disabled',
    }));

    const feedbackStats = {
      total: Number(feedbackRow?.total || 0),
      pending: Number(feedbackRow?.pending || 0),
      averageRating: Number(feedbackRow?.averageRating || 0),
    };

    const signupsByDay = buildSignupsByDay(clinicToday, signupRows);

    return res.json({
      success: true,
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        systemStatus: dbConnected ? 'Healthy' : 'Degraded',
        roleBreakdown,
        recentActivity,
        feedbackStats,
        signupsByDay,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Get admin dashboard summary error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
