const authService = require('../services/auth/authService');
const { registerPatient } = require('../services/patientRegistrationService');
const { asyncHandler } = require('../common/asyncHandler');
const { BadRequestError, ForbiddenError } = require('../errors/AppError');
const { setRefreshCookie } = require('./sessionTokens');

/** POST /api/auth/signup — public patient sign-up; signs the new patient in. */
exports.register = asyncHandler(async (req, res) => {
  const { account } = await registerPatient(req.body, null);
  const session = await authService.startSessionForNewAccount(account);
  setRefreshCookie(res, session.refreshToken, session.expiresAt);
  res.status(201).json({
    success: true,
    user: session.user,
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  });
});

/** POST /api/auth/register-patient — a nurse creates a patient account (ACCOUNT.created_by = nurse). */
exports.registerPatientByNurse = asyncHandler(async (req, res) => {
  if (String(req.user?.role || '').toLowerCase() !== 'nurse') {
    throw new ForbiddenError('Nurse access only');
  }
  const staffUserId = Number(req.user.userId);
  if (!Number.isFinite(staffUserId)) throw new BadRequestError('Invalid session');

  const { account } = await registerPatient(req.body, staffUserId);
  res.status(201).json({ success: true, userId: account.user_id, username: account.username });
});
