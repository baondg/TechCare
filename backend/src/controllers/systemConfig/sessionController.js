const sessionService = require('../../services/systemConfig/sessionService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/system-config/sessions */
exports.getSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listActiveSessions();
  res.json({ success: true, sessions, total: sessions.length });
});

/** DELETE /api/system-config/sessions/:id */
exports.revokeSession = asyncHandler(async (req, res) => {
  await sessionService.revokeSession(req.params.id, req.user?.userId);
  res.json({ success: true, message: 'Session revoked successfully' });
});

/** POST /api/system-config/sessions/revoke-all — `{ userId? }` */
exports.revokeAllSessions = asyncHandler(async (req, res) => {
  const revokedCount = await sessionService.revokeAllSessions(req.body.userId, req.user?.userId);
  res.json({ success: true, message: 'Sessions revoked successfully', revokedCount });
});
