const { z } = require('zod');

const requiredCredential = z.unknown().refine((v) => !!v, { error: 'Username and password are required' });

/** POST /login — `rememberMe` (optional) keeps the session for 7 days. */
const loginBody = z.object({
  username: requiredCredential,
  password: requiredCredential,
  rememberMe: z.unknown().optional(),
});

module.exports = { loginBody };
