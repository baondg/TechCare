const systemConfigRepository = require('../../repositories/systemConfigRepository');
const { JSON_CONFIG_KEYS, isLegacySystemConfigSchemaError } = require('../../config/systemConfigurationContract');
const { BadRequestError, ConflictError } = require('../../errors/AppError');
const { toBooleanString } = require('../../validators/systemConfigSchemas');

// TODO: these differ from config/systemConfigurationContract.js (appointment rate limit 60/60 vs
// 10/300, no aiRecovery* keys). Kept as-is until the correct values are decided — see
// BACKEND_REFACTOR_CHECKLIST.md.
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

/** JSON-valued keys: whether the value must be an array or a plain object. */
const JSON_SHAPES = {
  aiModelCatalog: 'array',
  aiModels: 'array',
  aiDefaultModelByFeature: 'object',
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Accepts the value itself or its JSON string; returns the canonical JSON string. */
function normalizeJsonConfig(key, value) {
  const shape = JSON_SHAPES[key];
  if (!shape) throw new BadRequestError(`Unsupported JSON config key: ${key}`);
  const matches = shape === 'array' ? Array.isArray : isPlainObject;
  const kind = shape === 'array' ? 'JSON array' : 'JSON object';

  if (matches(value)) return JSON.stringify(value);
  if (typeof value !== 'string') {
    throw new BadRequestError(`${key} must be a ${kind} or ${kind} string.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    throw new BadRequestError(`${key} must be valid JSON.`);
  }
  if (!matches(parsed)) throw new BadRequestError(`${key} must be a ${kind}.`);
  return JSON.stringify(parsed);
}

/** Validates one submitted value and returns what gets stored. */
function normalizeConfigValue(key, value) {
  if (BOOLEAN_CONFIG_KEYS.has(key)) {
    const normalized = toBooleanString(value);
    if (normalized === null) throw new BadRequestError(`${key} must be a boolean value`);
    return normalized;
  }
  const rule = NUMERIC_CONFIG_RULES[key];
  if (rule) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < rule.min || parsed > rule.max) {
      throw new BadRequestError(`Invalid ${key}. Must be an integer between ${rule.min} and ${rule.max}.`);
    }
    return value;
  }
  if (JSON_CONFIG_KEYS.has(key)) return normalizeJsonConfig(key, value);
  return value;
}

/**
 * Stored values over CONFIG_DEFAULTS. On a legacy (non key/value) schema, the defaults plus a
 * `warning`.
 */
async function getConfig() {
  let entries;
  try {
    entries = await systemConfigRepository.listEntries();
  } catch (error) {
    if (!isLegacySystemConfigSchemaError(error)) throw error;
    return {
      config: { ...CONFIG_DEFAULTS },
      warning: 'Legacy SYSTEM_CONFIGURATION schema detected. Using default config values.',
    };
  }
  const stored = {};
  for (const { key, value } of entries) stored[key] = value;
  return { config: { ...CONFIG_DEFAULTS, ...stored } };
}

/** Validates every key first (first problem wins), then stores them in submission order. */
async function updateConfig(updates) {
  const keys = Object.keys(updates || {});
  if (keys.length === 0) throw new BadRequestError('No configuration values provided');

  const unsupportedKeys = keys.filter((key) => !(key in CONFIG_DEFAULTS));
  if (unsupportedKeys.length > 0) {
    throw new BadRequestError(`Unsupported config keys: ${unsupportedKeys.join(', ')}`);
  }

  const normalized = {};
  for (const key of keys) normalized[key] = normalizeConfigValue(key, updates[key]);

  try {
    for (const key of keys) {
      await systemConfigRepository.upsertValue(key, normalized[key]);
    }
  } catch (error) {
    if (!isLegacySystemConfigSchemaError(error)) throw error;
    throw new ConflictError(
      'Cannot update system configuration: legacy SYSTEM_CONFIGURATION schema does not support key/value storage.'
    );
  }
}

module.exports = { CONFIG_DEFAULTS, getConfig, updateConfig };
