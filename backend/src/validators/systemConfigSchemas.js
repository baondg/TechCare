const { z } = require('zod');

const positiveId = (message) =>
  z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

/** true/1/'1'/'true' → 1, false/0/'0'/'false' → 0 (case-insensitive); anything else is invalid. */
function toBinaryFlag(raw) {
  if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true') return 1;
  if (raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false') return 0;
  return null;
}

/** PUT /features/:id/status */
const featureIdParams = z.object({ id: positiveId('Invalid feature id') });

/** PUT /features/:id/status */
const featureStatusBody = z.object({
  status: z.preprocess(
    toBinaryFlag,
    z.union([z.literal(0), z.literal(1)], { error: 'Status must be boolean (0/1 or true/false)' })
  ),
});

/** DELETE /sessions/:id */
const sessionIdParams = z.object({ id: positiveId('Invalid session id') });

/** POST /sessions/revoke-all — `userId` set: that user's sessions; absent/empty: every non-admin session. */
const revokeAllSessionsBody = z.object({
  userId: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : v),
    positiveId('Invalid userId').optional()
  ),
});

module.exports = {
  toBinaryFlag,
  featureIdParams,
  featureStatusBody,
  sessionIdParams,
  revokeAllSessionsBody,
};
