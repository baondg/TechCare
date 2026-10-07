const featureService = require('../../services/systemConfig/featureService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/system-config/features */
exports.getFeatures = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await featureService.listFeatures()) });
});

/** PUT /api/system-config/features/:id/status — `{ status }` coerced to 0/1 by `featureStatusBody`. */
exports.updateFeatureStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, feature: await featureService.setFeatureStatus(req.params.id, req.body.status) });
});
