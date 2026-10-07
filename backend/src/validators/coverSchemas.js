const { z } = require('zod');

const positiveId = z.coerce.number({ error: 'Invalid id' }).int({ error: 'Invalid id' }).positive({ error: 'Invalid id' });

/** PUT /:id/accept, PUT /:id/reject */
const coverIdParams = z.object({ id: positiveId });

/** POST /request */
const createCoverRequestBody = z.object({
  appointmentIds: z
    .array(z.coerce.number().int().positive(), { error: 'appointmentIds array is required' })
    .min(1, { error: 'appointmentIds array is required' }),
  reason: z.string().trim().optional(),
});

module.exports = { coverIdParams, createCoverRequestBody };
