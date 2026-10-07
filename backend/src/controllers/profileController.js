const profileService = require('../services/profileService');
const { asyncHandler } = require('../common/asyncHandler');

/** GET /api/profile/:userId — `{ profile, relative, insurance }` */
exports.getProfile = asyncHandler(async (req, res) => {
  res.json(await profileService.getProfile(req.user, req.params.userId));
});

/** PUT /api/profile/:userId — USER fields + the patient's relative. */
exports.updateProfile = asyncHandler(async (req, res) => {
  await profileService.updateProfile(req.user, req.params.userId, req.body);
  res.json({ message: 'Profile updated successfully' });
});

/** DELETE /api/profile/:userId — not supported (501). */
exports.deleteProfile = asyncHandler(async (req) => {
  profileService.deleteProfile(req.user, req.params.userId);
});
