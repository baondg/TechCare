const signatureService = require('../../services/emr/signatureService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/signature — the signed-in doctor's signature (data URL) or null. */
exports.getSignature = asyncHandler(async (req, res) => {
  res.json({ success: true, signature: await signatureService.getSignature(req.user.userId) });
});

/** PUT /api/doctor/signature — `{ signature }` (base64 data URL; empty clears it). */
exports.saveSignature = asyncHandler(async (req, res) => {
  await signatureService.saveSignature(req.user.userId, req.body?.signature);
  res.json({ success: true });
});
