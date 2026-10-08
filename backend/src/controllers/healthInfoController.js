const patientHealthInfoService = require('../services/patientHealthInfoService');
const { asyncHandler } = require('../common/asyncHandler');

/** GET /api/health-info/:userId — the signed-in patient's health info and record history. */
exports.getHealthInfo = asyncHandler(async (req, res) => {
  const { healthInfo, history } = await patientHealthInfoService.getHealthInfo(req.user, req.params.userId);
  res.json({ success: true, healthInfo, history });
});

/** POST /api/health-info/:userId — new vital-sign record + blood type / allergies / history. */
exports.createHealthInfo = asyncHandler(async (req, res) => {
  const healthInfo = await patientHealthInfoService.createHealthInfo(req.user, req.params.userId, req.body);
  res.status(201).json({ success: true, healthInfo });
});

/** PUT /api/health-info/:userId — edit draft record `body.id`. */
exports.updateHealthInfo = asyncHandler(async (req, res) => {
  const healthInfo = await patientHealthInfoService.updateHealthInfo(req.user, req.params.userId, req.body);
  res.json({ success: true, healthInfo });
});

/** PATCH /api/health-info/:userId/:recordId/confirm */
exports.confirmHealthInfo = asyncHandler(async (req, res) => {
  const { id, status } = await patientHealthInfoService.confirmHealthInfo(req.user, req.params.userId, req.params.recordId);
  res.json({ success: true, id, status });
});

/** DELETE /api/health-info/:userId and POST /api/health-info/:userId/delete — `{ ids }` */
exports.deleteHealthInfos = asyncHandler(async (req, res) => {
  const deletedCount = await patientHealthInfoService.deleteHealthInfos(req.user, req.params.userId, req.body?.ids);
  res.json({ success: true, message: `${deletedCount} record(s) deleted successfully` });
});
