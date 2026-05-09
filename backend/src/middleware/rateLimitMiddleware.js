const sequelize = require('../common/database');
const { Op } = require('sequelize');
const defineSystemConfig = require('../models/SystemConfig');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { getJwtSecret } = require('../security/jwtConfig');
const SystemConfig = defineSystemConfig(sequelize);
const {
  CONFIG_DEFAULTS,
  getRateLimitQueryKeysForScope,
  buildRateLimitPolicyFromKvMap,
  isLegacySystemConfigSchemaError,
  parsePositiveInt,
} = require('../config/systemConfigurationContract');

// In-memory rate limit store
const rateLimitStore = new Map();
let redisClient = null;
let redisDisabled = false;

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

const benchmarkBypassEnabled = () => parseBoolean(process.env.BENCHMARK_RATE_LIMIT_BYPASS, false);
const hasBenchmarkBypassHeader = (req) => parseBoolean(req.headers['x-benchmark-run'], false);
const POLICY_CACHE_TTL_MS = Number(process.env.RATE_LIMIT_POLICY_CACHE_MS || 30000);
const policyCache = new Map();
let systemConfigurationUnavailableUntil = 0;
const distributedRateLimitEnabled = () => parseBoolean(process.env.ENABLE_DISTRIBUTED_RATE_LIMIT, false);
const requireRedisWhenDistributed = () =>
  parseBoolean(process.env.REQUIRE_REDIS_FOR_DISTRIBUTED_RATE_LIMIT, false);

const createDistributedRateLimitConfigError = (reason) => {
  return new Error(`[rate-limit] Distributed rate limit misconfigured: ${reason}`);
};

const getValidatedRedisUrl = () => {
  const raw = String(process.env.REDIS_URL || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if ((protocol !== 'redis:' && protocol !== 'rediss:') || !parsed.hostname) {
      return null;
    }
    return raw;
  } catch (_error) {
    return null;
  }
};

async function getRedisClient() {
  if (!distributedRateLimitEnabled() || redisDisabled) return null;
  if (redisClient) return redisClient;
  const url = getValidatedRedisUrl();
  if (!url) {
    const reason = 'REDIS_URL is missing/invalid.';
    if (requireRedisWhenDistributed()) {
      throw createDistributedRateLimitConfigError(`${reason} Configure REDIS_URL or disable distributed mode.`);
    }
    console.warn(`[rate-limit] ${reason} Distributed rate limit disabled; using memory store.`);
    redisDisabled = true;
    return null;
  }
  const client = createClient({ url });
  client.on('error', (err) => {
    console.warn('[rate-limit] redis error:', err?.message || err);
  });
  try {
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch (error) {
    if (requireRedisWhenDistributed()) {
      throw createDistributedRateLimitConfigError(
        `Unable to connect to Redis (${error?.message || 'unknown error'}).`
      );
    }
    console.warn('[rate-limit] redis unavailable, fallback to memory store');
    redisDisabled = true;
    return null;
  }
}

async function incrementDistributedRateLimit(key, ttlSeconds) {
  const client = await getRedisClient();
  if (!client) return null;
  const lua = `
    local counter = redis.call("INCR", KEYS[1])
    if counter == 1 then
      redis.call("EXPIRE", KEYS[1], ARGV[1])
    end
    local ttl = redis.call("TTL", KEYS[1])
    return {counter, ttl}
  `;
  const [count, ttl] = await client.eval(lua, {
    keys: [key],
    arguments: [String(ttlSeconds)],
  });
  return {
    count: Number(count) || 1,
    ttlSeconds: Number(ttl) > 0 ? Number(ttl) : ttlSeconds,
  };
}

const getIdentifier = (req, ipBasedLimit) => {
  if (ipBasedLimit) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return req.ip || req.connection.remoteAddress || 'unknown';

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return decoded?.userId ? `user_${decoded.userId}` : req.ip || req.connection.remoteAddress || 'unknown';
  } catch (_error) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
};

const loadLegacyRowPolicy = async (scope, defaults) => {
  const rows = await sequelize.query(
    `SELECT rate_limit AS rateLimit, access_limit AS accessLimit
     FROM SYSTEM_CONFIGURATION
     ORDER BY id DESC
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const row = rows[0] || null;
  const derivedMax = row
    ? parsePositiveInt(
        scope === 'global' ? row.accessLimit ?? row.rateLimit : row.rateLimit,
        defaults.maxRequests
      )
    : defaults.maxRequests;
  return {
    enabled: true,
    ipBasedLimit: true,
    maxRequests: derivedMax,
    windowSeconds: defaults.windowSeconds,
  };
};

const loadRateLimitPolicy = async (scope, defaults) => {
  const now = Date.now();
  const cacheKey = `kv:${scope}:${defaults.maxRequests}:${defaults.windowSeconds}`;
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.policy;
  if (systemConfigurationUnavailableUntil > now) {
    return {
      enabled: true,
      ipBasedLimit: true,
      maxRequests: defaults.maxRequests,
      windowSeconds: defaults.windowSeconds,
    };
  }
  try {
    const keys = getRateLimitQueryKeysForScope(scope);
    const configs = await SystemConfig.findAll({
      where: { key: { [Op.in]: keys } },
      attributes: ['key', 'value'],
    });
    const map = { ...CONFIG_DEFAULTS };
    for (const item of configs) {
      if (item && item.key != null && item.value !== undefined && item.value !== null) {
        map[item.key] = String(item.value);
      }
    }
    const policy = buildRateLimitPolicyFromKvMap(map, scope, defaults);
    policyCache.set(cacheKey, { policy, expiresAt: now + POLICY_CACHE_TTL_MS });
    return policy;
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) {
      try {
        const policy = await loadLegacyRowPolicy(scope, defaults);
        policyCache.set(cacheKey, { policy, expiresAt: now + POLICY_CACHE_TTL_MS });
        return policy;
      } catch (legacyError) {
        if (isLegacySystemConfigSchemaError(legacyError)) {
          systemConfigurationUnavailableUntil = now + POLICY_CACHE_TTL_MS;
          return {
            enabled: true,
            ipBasedLimit: true,
            maxRequests: defaults.maxRequests,
            windowSeconds: defaults.windowSeconds,
          };
        }
        throw legacyError;
      }
    }
    throw error;
  }
};

const buildRateLimiter = (scope, defaults, message) => async (req, res, next) => {
  try {
    if (benchmarkBypassEnabled() && hasBenchmarkBypassHeader(req)) {
      return next();
    }
    const policy = await loadRateLimitPolicy(scope, defaults);
    if (!policy.enabled) return next();

    const identifier = getIdentifier(req, policy.ipBasedLimit);
    const key = `${scope}:ratelimit:${req.path}:${identifier}`;
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;
    const distributed = await incrementDistributedRateLimit(key, policy.windowSeconds);

    if (distributed) {
      const resetTime = now + distributed.ttlSeconds * 1000;
      if (distributed.count > policy.maxRequests) {
        return res.status(429).json({
          success: false,
          error: message,
          retryAfter: distributed.ttlSeconds,
          limit: policy.maxRequests,
          windowSeconds: policy.windowSeconds,
        });
      }
      res.setHeader('X-RateLimit-Limit', policy.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, policy.maxRequests - distributed.count));
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      return next();
    }

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
exports.aiRecoveryRateLimit = buildRateLimiter(
  'aiRecovery',
  { maxRequests: 8, windowSeconds: 60 },
  'Too many recovery prediction requests. Please try again later.'
);
exports.appointmentRateLimit = buildRateLimiter(
  'appointment',
  { maxRequests: 10, windowSeconds: 5 * 60 },
  'Too many appointment requests. Please try again later.'
);

// Middleware quản lý rate limiting: giới hạn số lượng request trong một khoảng thời gian (in-memory store)