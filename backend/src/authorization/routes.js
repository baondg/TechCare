const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const AuthController = require('./controller');
const authenticateToken = require('../middleware/authMiddleware');

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts per 15 min (relaxed for development)
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 registrations per hour (relaxed for development)
  message: {
    success: false,
    error: 'Too many accounts created from this IP. Please try again after an hour.'
  }
});

// Public routes (with rate limiting)
router.post('/signup', registerLimiter, AuthController.register);
router.post('/login', authLimiter, AuthController.login);
router.post('/refresh', AuthController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticateToken, AuthController.logout);
router.get('/session', authenticateToken, AuthController.getSession);

module.exports = router;