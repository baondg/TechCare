const router = require('express').Router();
const registrationController = require('./registrationController');
const authSessionController = require('./sessionController');
const authenticateToken = require('../middleware/authMiddleware');
const sessionMiddleware = require('../middleware/sessionMiddleware');
const {
  authLoginRateLimit,
  authRegistrationRateLimit,
} = require('../middleware/rateLimitMiddleware');

// Public routes (with rate limiting)
router.post('/signup', authRegistrationRateLimit, registrationController.register);
router.post('/login', authLoginRateLimit, sessionMiddleware.checkConcurrentUsers, authSessionController.login);
router.post('/refresh', authSessionController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticateToken, authSessionController.logout);
router.get('/session', authenticateToken, authSessionController.getSession);
router.post('/register-patient', authenticateToken, registrationController.registerPatientByNurse);

module.exports = router;