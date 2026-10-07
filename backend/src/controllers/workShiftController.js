const workShiftService = require('../services/workShiftService');
const { asyncHandler } = require('../common/asyncHandler');

exports.getStaffDirectory = asyncHandler(async (req, res) => {
  const out = await workShiftService.getStaffDirectory(req.user?.role);
  res.status(out.status).json(out.json);
});

exports.getMyWorkShifts = asyncHandler(async (req, res) => {
  const out = await workShiftService.getMyWorkShifts(req.user?.userId, req.user?.role, req.query);
  res.status(out.status).json(out.json);
});
