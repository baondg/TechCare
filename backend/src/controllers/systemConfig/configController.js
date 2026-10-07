const { JSON_CONFIG_KEYS, isLegacySystemConfigSchemaError } = require('../../config/systemConfigurationContract');
const { SystemConfig, toBooleanString, upsertConfig } = require('./configStore');

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

const parseInteger = (value) => Number.parseInt(String(value), 10);

const validateNumericConfig = (key, value) => {
  const rule = NUMERIC_CONFIG_RULES[key];
  if (!rule) return null;
  const parsed = parseInteger(value);
  if (!Number.isFinite(parsed) || parsed < rule.min || parsed > rule.max) {
    return `Invalid ${key}. Must be an integer between ${rule.min} and ${rule.max}.`;
  }
  return null;
};

/** @returns {{ value?: string; error?: string }} */
const normalizeJsonConfig = (key, value) => {
  if (key === 'aiModelCatalog') {
    if (Array.isArray(value)) {
      return { value: JSON.stringify(value) };
    }
    if (typeof value !== 'string') {
      return { error: 'aiModelCatalog must be a JSON array or JSON array string.' };
    }
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      return { error: 'aiModelCatalog must be valid JSON.' };
    }
    if (!Array.isArray(parsed)) {
      return { error: 'aiModelCatalog must be a JSON array.' };
    }
    return { value: JSON.stringify(parsed) };
  }
  if (key === 'aiModels') {
    if (Array.isArray(value)) {
      return { value: JSON.stringify(value) };
    }
    if (typeof value !== 'string') {
      return { error: 'aiModels must be a JSON array or JSON array string.' };
    }
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      return { error: 'aiModels must be valid JSON.' };
    }
    if (!Array.isArray(parsed)) {
      return { error: 'aiModels must be a JSON array.' };
    }
    return { value: JSON.stringify(parsed) };
  }
  if (key === 'aiDefaultModelByFeature') {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return { value: JSON.stringify(value) };
    }
    if (typeof value !== 'string') {
      return { error: 'aiDefaultModelByFeature must be a JSON object or JSON object string.' };
    }
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      return { error: 'aiDefaultModelByFeature must be valid JSON.' };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'aiDefaultModelByFeature must be a JSON object.' };
    }
    return { value: JSON.stringify(parsed) };
  }
  return { error: `Unsupported JSON config key: ${key}` };
};

// Lấy tất cả cấu hình hệ thống
exports.getConfig = async (req, res) => {
  try {
    const configs = await SystemConfig.findAll();
    const configMap = {};
    configs.forEach(config => {
      configMap[config.key] = config.value;
    });

    // Set default values if not exists
    const defaults = CONFIG_DEFAULTS;

    res.json({
      success: true,
      config: { ...defaults, ...configMap }
    });
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) {
      return res.json({
        success: true,
        config: { ...CONFIG_DEFAULTS },
        warning: 'Legacy SYSTEM_CONFIGURATION schema detected. Using default config values.',
      });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Cập nhật cấu hình hệ thống
exports.updateConfig = async (req, res) => {
  try {
    const updates = req.body || {};
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: 'No configuration values provided' });
    }

    const unsupportedKeys = keys.filter((key) => !(key in CONFIG_DEFAULTS));
    if (unsupportedKeys.length > 0) {
      return res.status(400).json({ success: false, error: `Unsupported config keys: ${unsupportedKeys.join(', ')}` });
    }

    const normalizedValues = {};
    for (const key of keys) {
      if (BOOLEAN_CONFIG_KEYS.has(key)) {
        const normalized = toBooleanString(updates[key]);
        if (normalized === null) {
          return res.status(400).json({ success: false, error: `${key} must be a boolean value` });
        }
        normalizedValues[key] = normalized;
      } else if (NUMERIC_CONFIG_RULES[key]) {
        const validationError = validateNumericConfig(key, updates[key]);
        if (validationError) return res.status(400).json({ success: false, error: validationError });
        normalizedValues[key] = updates[key];
      } else if (JSON_CONFIG_KEYS.has(key)) {
        const normalized = normalizeJsonConfig(key, updates[key]);
        if (normalized.error) {
          return res.status(400).json({ success: false, error: normalized.error });
        }
        normalizedValues[key] = normalized.value;
      } else {
        normalizedValues[key] = updates[key];
      }
    }

    for (const key of keys) {
      await upsertConfig(key, normalizedValues[key]);
    }

    res.json({
      success: true,
      message: 'System configuration updated successfully'
    });
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) {
      return res.status(409).json({
        success: false,
        error:
          'Cannot update system configuration: legacy SYSTEM_CONFIGURATION schema does not support key/value storage.',
      });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
