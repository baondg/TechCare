const adminDashboardRepository = require('../../repositories/adminDashboardRepository');
const { getClinicTodayYmd, getClinicTimezone, getClinicTzOffset } = require('../../common/clinicDate');
const { ACCOUNT_ROLE_LABEL } = require('./roleLabels');

/** Last 7 clinic days ending `clinicToday`, oldest first, with 0 for days without sign-ups. */
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

async function getSummary() {
  const countRow = await adminDashboardRepository.getAccountTotals();
  const roleRows = await adminDashboardRepository.countAccountsByRole();
  const recentRows = await adminDashboardRepository.listRecentAccounts();
  const clinicToday = getClinicTodayYmd();
  const feedbackRow = await adminDashboardRepository.getFeedbackTotals();
  const signupRows = await adminDashboardRepository.countSignupsByDay(clinicToday);
  const dbConnected = await adminDashboardRepository.isDatabaseReachable();

  const totalUsers = Number(countRow?.totalUsers || 0);
  const activeUsers = Number(countRow?.activeUsers || 0);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: Math.max(0, totalUsers - activeUsers),
    systemStatus: dbConnected ? 'Healthy' : 'Degraded',
    roleBreakdown: roleRows.map((r) => ({
      roleCode: String(r.type || ''),
      roleLabel: ACCOUNT_ROLE_LABEL[r.type] || String(r.type || ''),
      total: Number(r.total || 0),
    })),
    recentActivity: recentRows.map((r) => ({
      id: Number(r.id),
      message: `Account '${r.username || `#${r.id}`}' (${ACCOUNT_ROLE_LABEL[r.type] || r.type}) created`,
      createdTime: r.createdTime || null,
      status: r.status === 1 || r.status === true || r.status === '1' ? 'Enabled' : 'Disabled',
    })),
    feedbackStats: {
      total: Number(feedbackRow?.total || 0),
      pending: Number(feedbackRow?.pending || 0),
      averageRating: Number(feedbackRow?.averageRating || 0),
    },
    signupsByDay: buildSignupsByDay(clinicToday, signupRows),
  };
}

module.exports = { getSummary, buildSignupsByDay };
