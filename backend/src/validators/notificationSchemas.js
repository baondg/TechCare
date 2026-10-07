const { z } = require('zod');

/** PATCH /:id/read */
const notificationIdParams = z.object({
  id: z.coerce.number({ error: 'Invalid id' }).int({ error: 'Invalid id' }).positive({ error: 'Invalid id' }),
});

module.exports = { notificationIdParams };
