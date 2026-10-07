/**
 * Single source of truth for SYSTEM_CONFIGURATION key/value contract.
 * Used by services/systemConfig/configService, rateLimitMiddleware, and migration scripts.
 */

/**
 * Keys an admin can read / set through GET|PUT /api/system-config, with their defaults.
 * Rate-limit defaults match the fallbacks in middleware/rateLimitMiddleware.js.
 * aiModelCatalog is edited through its own endpoint, so it is not listed here.
 * @type {Record<string, string>}
 */
const CONFIG_DEFAULTS = {
  maxConcurrentUsers: '500',
  sessionTimeoutMinutes: '30',
  rateLimitEnabled: 'true',
  rateLimitIpBased: 'true',
  globalRateLimitRequests: '100',
  globalRateLimitWindowSeconds: '60',
  loginRateLimitRequests: '100',
  loginRateLimitWindowSeconds: '900',
  registrationRateLimitRequests: '20',
  registrationRateLimitWindowSeconds: '3600',
  chatbotRateLimitRequests: '20',
  chatbotRateLimitWindowSeconds: '60',
  aiSymptomRateLimitRequests: '10',
  aiSymptomRateLimitWindowSeconds: '60',
  appointmentRateLimitRequests: '60',
  appointmentRateLimitWindowSeconds: '60',
  aiModels: '[]',
  aiDefaultModelByFeature: '{}',
};

/** @type {Record<string, { min: number; max: number }>} */
const NUMERIC_CONFIG_RULES = {
  maxConcurrentUsers: { min: 1, max: 100000 },
  sessionTimeoutMinutes: { min: 5, max: 10080 },
  globalRateLimitRequests: { min: 1, max: 100000 },
  globalRateLimitWindowSeconds: { min: 1, max: 86400 },
  loginRateLimitRequests: { min: 1, max: 1000 },
  loginRateLimitWindowSeconds: { min: 30, max: 86400 },
  registrationRateLimitRequests: { min: 1, max: 1000 },
  registrationRateLimitWindowSeconds: { min: 30, max: 86400 },
  chatbotRateLimitRequests: { min: 1, max: 10000 },
  chatbotRateLimitWindowSeconds: { min: 1, max: 86400 },
  aiSymptomRateLimitRequests: { min: 1, max: 10000 },
  aiSymptomRateLimitWindowSeconds: { min: 1, max: 86400 },
  appointmentRateLimitRequests: { min: 1, max: 10000 },
  appointmentRateLimitWindowSeconds: { min: 1, max: 86400 },
};

const BOOLEAN_CONFIG_KEYS = new Set(['rateLimitEnabled', 'rateLimitIpBased']);

const JSON_CONFIG_KEYS = new Set(['aiModelCatalog', 'aiModels', 'aiDefaultModelByFeature']);

/**
 * Maps rate-limit middleware scope to CONFIG_DEFAULTS keys.
 * @type {Record<string, { requestsKey: string; windowSecondsKey: string }>}
 */
const RATE_LIMIT_SCOPE_TO_KEYS = {
  global: { requestsKey: 'globalRateLimitRequests', windowSecondsKey: 'globalRateLimitWindowSeconds' },
  login: { requestsKey: 'loginRateLimitRequests', windowSecondsKey: 'loginRateLimitWindowSeconds' },
  registration: { requestsKey: 'registrationRateLimitRequests', windowSecondsKey: 'registrationRateLimitWindowSeconds' },
  chatbot: { requestsKey: 'chatbotRateLimitRequests', windowSecondsKey: 'chatbotRateLimitWindowSeconds' },
  aiSymptom: { requestsKey: 'aiSymptomRateLimitRequests', windowSecondsKey: 'aiSymptomRateLimitWindowSeconds' },
  aiRecovery: { requestsKey: 'aiRecoveryRateLimitRequests', windowSecondsKey: 'aiRecoveryRateLimitWindowSeconds' },
  appointment: { requestsKey: 'appointmentRateLimitRequests', windowSecondsKey: 'appointmentRateLimitWindowSeconds' },
};

/** Keys needed for any rate-limit policy load (flags + one scope pair). */
function getRateLimitQueryKeysForScope(scope) {
  const pair = RATE_LIMIT_SCOPE_TO_KEYS[scope];
  if (!pair) {
    return ['rateLimitEnabled', 'rateLimitIpBased', 'globalRateLimitRequests', 'globalRateLimitWindowSeconds'];
  }
  return ['rateLimitEnabled', 'rateLimitIpBased', pair.requestsKey, pair.windowSecondsKey];
}

const isLegacySystemConfigSchemaError = (error) =>
  error?.original?.code === 'ER_BAD_FIELD_ERROR' || error?.original?.code === 'ER_NO_SUCH_TABLE';

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

/**
 * Build effective rate-limit policy from a flat key -> value map (DB or merged with defaults).
 * @param {Record<string, string|undefined>} map
 * @param {string} scope
 * @param {{ maxRequests: number; windowSeconds: number }} defaults
 */
function buildRateLimitPolicyFromKvMap(map, scope, defaults) {
  const pair = RATE_LIMIT_SCOPE_TO_KEYS[scope] || RATE_LIMIT_SCOPE_TO_KEYS.global;
  const enabled = parseBoolean(map.rateLimitEnabled, true);
  const ipBasedLimit = parseBoolean(map.rateLimitIpBased, true);
  const maxRequests = parsePositiveInt(map[pair.requestsKey], defaults.maxRequests);
  const windowSeconds = parsePositiveInt(map[pair.windowSecondsKey], defaults.windowSeconds);
  return {
    enabled,
    ipBasedLimit,
    maxRequests,
    windowSeconds,
  };
}

module.exports = {
  CONFIG_DEFAULTS,
  NUMERIC_CONFIG_RULES,
  BOOLEAN_CONFIG_KEYS,
  JSON_CONFIG_KEYS,
  RATE_LIMIT_SCOPE_TO_KEYS,
  getRateLimitQueryKeysForScope,
  isLegacySystemConfigSchemaError,
  buildRateLimitPolicyFromKvMap,
  parseBoolean,
  parsePositiveInt,
};
