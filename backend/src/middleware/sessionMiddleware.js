const sessionRepository = require('../repositories/sessionRepository');
const systemConfigRepository = require('../repositories/systemConfigRepository');
const logger = require('../common/logger');



// Làm sạch các session đã hết hạn
const cleanupExpiredSessions = async () => {
  try {
    await sessionRepository.deleteExpiredSessions();
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up expired sessions');
  }
};

const getNumericConfig = async (key, fallback) => {
  try {
    const value = await systemConfigRepository.getValue(key);
    if (value == null) return fallback;

    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch (_error) {
    // Legacy deployments may not have key/value system config schema.
    return fallback;
  }
};

// Kiểm tra và làm sạch session định kỳ (mỗi 5 phút). Phiên hết hạn của một request do
// authMiddleware chặn (401 SESSION_EXPIRED) và xoá.
// unref: the timer must not keep the process alive on its own (tests, graceful shutdown).
setInterval(cleanupExpiredSessions, 5 * 60 * 1000).unref();

// Kiểm tra số lượng user đồng thời
exports.checkConcurrentUsers = async (req, res, next) => {
  try {
    // Làm sạch session hết hạn trước
    await cleanupExpiredSessions();
    
    const maxUsers = await getNumericConfig('maxConcurrentUsers', 500);
    
    const activeSessions = await sessionRepository.countActiveSessions();
    
    if (activeSessions >= maxUsers) {
      return res.status(429).json({
        success: false,
        error: `Maximum concurrent users (${maxUsers}) reached. Please try again later.`
      });
    }
    
    req.maxConcurrentUsers = maxUsers;
    req.currentActiveUsers = activeSessions;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error checking concurrent users');
    next();
  }
};

// Middleware quản lý session: làm sạch session hết hạn định kỳ và kiểm tra giới hạn số user đồng thời khi đăng nhập
