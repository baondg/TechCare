const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);
const jwt = require('jsonwebtoken');

// In-memory rate limit store
const rateLimitStore = new Map();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

// Get rate limit info from memory
const getRateLimitInfo = (key) => {
  const record = rateLimitStore.get(key);
  return record ? { count: record.count, resetTime: record.resetTime } : null;
};

// Increment counter in memory
const incrementRateLimit = (key, ttlSeconds) => {
  const record = rateLimitStore.get(key);
  if (record) {
    record.count++;
    rateLimitStore.set(key, record);
    return record.count;
  } else {
    const now = Date.now();
    const newRecord = {
      count: 1,
      resetTime: now + (ttlSeconds * 1000),
      firstRequest: now
    };
    rateLimitStore.set(key, newRecord);
    return 1;
  }
};

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getIdentifier = (req, ipBasedLimit) => {
  if (ipBasedLimit) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return req.ip || req.connection.remoteAddress || 'unknown';

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    return decoded?.userId ? `user_${decoded.userId}` : req.ip || req.connection.remoteAddress || 'unknown';
  } catch (_error) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
};

const loadRateLimitPolicy = async (scope, defaults) => {
  const keys = [
    'rateLimitEnabled',
    'rateLimitIpBased',
    `${scope}RateLimitRequests`,
    `${scope}RateLimitWindowSeconds`,
  ];

  const configs = await SystemConfig.findAll({ where: { key: keys } });
  const map = {};
  configs.forEach((item) => {
    map[item.key] = item.value;
  });

  return {
    enabled: parseBoolean(map.rateLimitEnabled, true),
    ipBasedLimit: parseBoolean(map.rateLimitIpBased, true),
    maxRequests: parsePositiveInt(map[`${scope}RateLimitRequests`], defaults.maxRequests),
    windowSeconds: parsePositiveInt(map[`${scope}RateLimitWindowSeconds`], defaults.windowSeconds),
  };
};

const buildRateLimiter = (scope, defaults, message) => async (req, res, next) => {
  try {
    const policy = await loadRateLimitPolicy(scope, defaults);
    if (!policy.enabled) return next();

    const identifier = getIdentifier(req, policy.ipBasedLimit);
    const key = `${scope}:ratelimit:${req.path}:${identifier}`;
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;
    const record = getRateLimitInfo(key);

    if (!record || now > record.resetTime) {
      const count = incrementRateLimit(key, policy.windowSeconds);
      const resetTime = now + windowMs;
      res.setHeader('X-RateLimit-Limit', policy.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, policy.maxRequests - count));
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      return next();
    }

    const count = incrementRateLimit(key, policy.windowSeconds);
    if (count > policy.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter,
        limit: policy.maxRequests,
        windowSeconds: policy.windowSeconds,
      });
    }

    res.setHeader('X-RateLimit-Limit', policy.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, policy.maxRequests - count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    return next();
  } catch (error) {
    console.error('Rate limit error:', error);
    return next();
  }
};

exports.globalRateLimit = buildRateLimiter(
  'global',
  { maxRequests: 100, windowSeconds: 60 },
  'Too many requests. Please try again later.'
);
exports.authLoginRateLimit = buildRateLimiter(
  'login',
  { maxRequests: 100, windowSeconds: 15 * 60 },
  'Too many login attempts. Please try again later.'
);
exports.authRegistrationRateLimit = buildRateLimiter(
  'registration',
  { maxRequests: 20, windowSeconds: 60 * 60 },
  'Too many registration attempts. Please try again later.'
);
exports.aiChatRateLimit = buildRateLimiter(
  'chatbot',
  { maxRequests: 20, windowSeconds: 60 },
  'Too many chatbot requests. Please slow down.'
);
exports.aiSymptomRateLimit = buildRateLimiter(
  'aiSymptom',
  { maxRequests: 10, windowSeconds: 60 },
  'Too many symptom analysis requests. Please try again later.'
);
exports.appointmentRateLimit = buildRateLimiter(
  'appointment',
  { maxRequests: 10, windowSeconds: 5 * 60 },
  'Too many appointment requests. Please try again later.'
);

// Middleware quản lý rate limiting: giới hạn số lượng request trong một khoảng thời gian (in-memory store)