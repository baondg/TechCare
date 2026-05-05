const router = require('express').Router();
const AuthController = require('./controller');
const authenticateToken = require('../middleware/authMiddleware');
const sessionMiddleware = require('../middleware/sessionMiddleware');
const {
  authLoginRateLimit,
  authRegistrationRateLimit,
} = require('../middleware/rateLimitMiddleware');

// Public routes (with rate limiting)
router.post('/signup', authRegistrationRateLimit, AuthController.register);
router.post('/login', authLoginRateLimit, sessionMiddleware.checkConcurrentUsers, AuthController.login);
router.post('/refresh', AuthController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticateToken, AuthController.logout);
router.get('/session', authenticateToken, AuthController.getSession);
router.post('/register-patient', authenticateToken, AuthController.registerPatientByNurse);

module.exports = router;