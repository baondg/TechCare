const doctorDashboardService = require('../../services/emr/doctorDashboardService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/dashboard/summary — doctor home, or the lab queue for technicians. */
exports.getDashboardSummary = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await doctorDashboardService.getDashboard(req.user)) });
});
