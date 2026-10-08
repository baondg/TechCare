const { z } = require('zod');

const requiredCredential = z.unknown().refine((v) => !!v, { error: 'Username and password are required' });

/** POST /login — `rememberMe` (optional) keeps the session for 7 days. */
const loginBody = z.object({
  username: requiredCredential,
  password: requiredCredential,
  rememberMe: z.unknown().optional(),
});

const requiredPassword = (label) =>
  z.string({ error: `${label} is required` }).min(1, { error: `${label} is required` });

/** POST /change-password — strength is checked by the service (same rule as sign-up). */
const changePasswordBody = z.object({
  currentPassword: requiredPassword('Current password'),
  newPassword: requiredPassword('New password'),
});

module.exports = { loginBody, changePasswordBody };
