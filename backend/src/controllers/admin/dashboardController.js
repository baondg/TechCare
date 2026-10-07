const dashboardService = require('../../services/admin/dashboardService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/admin/dashboard-summary */
exports.getDashboardSummary = asyncHandler(async (req, res) => {
  res.json({ success: true, summary: await dashboardService.getSummary() });
});
