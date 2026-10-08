const router = require('express').Router();
const registrationController = require('./registrationController');
const authSessionController = require('./sessionController');
const authenticateToken = require('../middleware/authMiddleware');
const sessionMiddleware = require('../middleware/sessionMiddleware');
const { internalErrorMessage } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validate');
const { loginBody, changePasswordBody } = require('../validators/authSchemas');
const {
  authLoginRateLimit,
  authRegistrationRateLimit,
} = require('../middleware/rateLimitMiddleware');

// The auth screens show the server's `error` text as-is, so 500s keep a friendly message.
const REGISTRATION_FAILED = 'Registration failed. Please try again.';

// Public routes (with rate limiting)
router.post('/signup', internalErrorMessage(REGISTRATION_FAILED), authRegistrationRateLimit, registrationController.register);
router.post(
  '/login',
  internalErrorMessage('Login failed. Please try again.'),
  authLoginRateLimit,
  sessionMiddleware.checkConcurrentUsers,
  validate({ body: loginBody }),
  authSessionController.login
);
router.post('/refresh', internalErrorMessage('Token refresh failed'), authSessionController.refreshToken);

// Protected routes (require authentication). These three stay open while an admin-issued
// password is pending change (PASSWORD_CHANGE_REQUIRED everywhere else).
const authenticatePendingPasswordChange = authenticateToken.allowingPendingPasswordChange;
router.post('/logout', internalErrorMessage('Logout failed'), authenticatePendingPasswordChange, authSessionController.logout);
router.get('/session', internalErrorMessage('Failed to get session info'), authenticatePendingPasswordChange, authSessionController.getSession);
router.post(
  '/change-password',
  internalErrorMessage('Password change failed'),
  authLoginRateLimit,
  authenticatePendingPasswordChange,
  validate({ body: changePasswordBody }),
  authSessionController.changePassword
);
router.post(
  '/register-patient',
  internalErrorMessage(REGISTRATION_FAILED),
  authenticateToken,
  registrationController.registerPatientByNurse
);

module.exports = router;
