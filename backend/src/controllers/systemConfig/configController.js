const configService = require('../../services/systemConfig/configService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/system-config — stored values over defaults. */
exports.getConfig = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await configService.getConfig()) });
});

/** PUT /api/system-config — `{ [key]: value }`, all keys validated before anything is saved. */
exports.updateConfig = asyncHandler(async (req, res) => {
  await configService.updateConfig(req.body);
  res.json({ success: true, message: 'System configuration updated successfully' });
});
