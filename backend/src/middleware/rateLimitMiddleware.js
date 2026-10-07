const sequelize = require('../common/database');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { getJwtSecret } = require('../security/jwtConfig');
const {
  RATE_LIMIT_SCOPE_TO_KEYS,
  getRateLimitQueryKeysForScope,
  buildRateLimitPolicyFromKvMap,
  parsePositiveInt,
} = require('../config/systemConfigurationContract');
const logger = require('../common/logger');
const { config } = require('../config/env');

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
}, 60000).unref();

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

const benchmarkBypassEnabled = () => config.rateLimit.benchmarkBypass;
const hasBenchmarkBypassHeader = (req) => parseBoolean(req.headers['x-benchmark-run'], false);
const POLICY_CACHE_TTL_MS = config.rateLimit.policyCacheMs;
const policyCache = new Map();
let systemConfigurationUnavailableUntil = 0;
const distributedRateLimitEnabled = () => config.rateLimit.distributed;
const requireRedisWhenDistributed = () => config.rateLimit.requireRedisForDistributed;

const createDistributedRateLimitConfigError = (reason) => {
  return new Error(`[rate-limit] Distributed rate limit misconfigured: ${reason}`);
};

const getValidatedRedisUrl = () => {
  const raw = config.redis.url;
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
    logger.warn(`[rate-limit] ${reason} Distributed rate limit disabled; using memory store.`);
    redisDisabled = true;
    return null;
  }
  const client = createClient({ url });
  client.on('error', (err) => {
    logger.warn({ err }, '[rate-limit] redis error');
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
    logger.warn('[rate-limit] redis unavailable, fallback to memory store');
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


/** `<SCOPE>_RATE_LIMIT_MAX` / `<SCOPE>_RATE_LIMIT_WINDOW_SECONDS` env overrides. */
const envScopeOverride = (scope, field, fallback) => {
  const overrides = field === 'max' ? config.rateLimit.maxOverrides : config.rateLimit.windowSecondsOverrides;
  return parsePositiveInt(overrides[String(scope).toLowerCase()], fallback);
};

/**
 * Policy from the key/value SYSTEM_CONFIGURATION rows of the scope (keys: RATE_LIMIT_SCOPE_TO_KEYS),
 * then env overrides; null when none of the keys is stored.
 */
const loadKeyValueRateLimitPolicy = async (scope, defaults) => {
  if (!RATE_LIMIT_SCOPE_TO_KEYS[scope]) return null;
  const rows = await sequelize.query(
    `SELECT \`key\` AS configKey, value
     FROM SYSTEM_CONFIGURATION
     WHERE \`key\` IN (:keys)`,
    { replacements: { keys: getRateLimitQueryKeysForScope(scope) }, type: sequelize.QueryTypes.SELECT }
  );
  if (!rows?.length) return null;

  const stored = Object.fromEntries(rows.map((row) => [row.configKey, row.value]));
  const policy = buildRateLimitPolicyFromKvMap(stored, scope, defaults);
  policy.maxRequests = envScopeOverride(scope, 'max', policy.maxRequests);
  policy.windowSeconds = envScopeOverride(scope, 'window', policy.windowSeconds);
  if (config.isDevelopment && config.rateLimit.relaxed) {
    policy.maxRequests = Math.max(policy.maxRequests, defaults.maxRequests * 10);
  }
  return policy;
};

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

const fallbackPolicy = (scope, defaults) => ({
  enabled: true,
  ipBasedLimit: true,
  maxRequests: envScopeOverride(scope, 'max', defaults.maxRequests),
  windowSeconds: envScopeOverride(scope, 'window', defaults.windowSeconds),
});

const loadRateLimitPolicy = async (scope, defaults) => {
  const now = Date.now();
  const cacheKey = `kv:${scope}:${defaults.maxRequests}:${defaults.windowSeconds}`;
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.policy;
  if (systemConfigurationUnavailableUntil > now) {
    return fallbackPolicy(scope, defaults);
  }
  try {
    try {
      const kvPolicy = await loadKeyValueRateLimitPolicy(scope, defaults);
      if (kvPolicy) {
        policyCache.set(cacheKey, { policy: kvPolicy, expiresAt: now + POLICY_CACHE_TTL_MS });
        return kvPolicy;
      }
    } catch (kvError) {
      if (kvError?.original?.code !== 'ER_NO_SUCH_TABLE' && kvError?.original?.code !== 'ER_BAD_FIELD_ERROR') {
        throw kvError;
      }
    }

    const rows = await sequelize.query(
      `SELECT rate_limit AS rateLimit, access_limit AS accessLimit
       FROM SYSTEM_CONFIGURATION
       ORDER BY time DESC, id DESC
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
    const policy = {
      enabled: true,
      ipBasedLimit: true,
      maxRequests: envScopeOverride(scope, 'max', derivedMax),
      windowSeconds: envScopeOverride(scope, 'window', defaults.windowSeconds),
    };
    policyCache.set(cacheKey, { policy, expiresAt: now + POLICY_CACHE_TTL_MS });
    return policy;
  } catch (error) {
    if (error?.original?.code === 'ER_NO_SUCH_TABLE' || error?.original?.code === 'ER_BAD_FIELD_ERROR') {
      systemConfigurationUnavailableUntil = now + POLICY_CACHE_TTL_MS;
      return fallbackPolicy(scope, defaults);
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
    logger.error({ err: error }, 'Rate limit error');
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
  { maxRequests: 60, windowSeconds: 60 },
  'Too many appointment requests. Please try again later.'
);

// Middleware quản lý rate limiting: giới hạn số lượng request trong một khoảng thời gian (in-memory store)