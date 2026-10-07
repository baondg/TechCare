const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);
const Session = require('../models/Session');
const { Op } = require('sequelize');
const {
  JSON_CONFIG_KEYS,
  isLegacySystemConfigSchemaError,
} = require('../config/systemConfigurationContract');

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

const toBooleanString = (value) => {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 'true';
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 'false';
  return null;
};

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

const upsertConfig = async (key, value, description = null) => {
  await SystemConfig.upsert({
    key,
    value: String(value),
    description: description || `System configuration for ${key}`,
  });
};

const getAccountRoleCodeByUserId = async (userId) => {
  const [row] = await sequelize.query(
    'SELECT type FROM ACCOUNT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
  );
  return row?.type ? String(row.type).trim().toUpperCase() : '';
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

exports.getSessions = async (req, res) => {
  try {
    const sessions = await sequelize.query(
      `SELECT
         s.id,
         s.userId,
         s.lastActivity,
         s.expiresAt,
         s.ipAddress,
         s.userAgent,
         COALESCE(a.type, '') AS roleCode
       FROM SESSION s
       LEFT JOIN ACCOUNT a ON a.user_id = s.userId
       WHERE s.expiresAt > NOW()
       ORDER BY s.lastActivity DESC
       LIMIT 500`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid session id' });
    }

    const session = await Session.findOne({ where: { id }, attributes: ['id', 'userId'] });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const targetUserId = Number(session.userId);
    const currentUserId = Number(req.user?.userId);
    if (Number.isFinite(currentUserId) && currentUserId > 0 && targetUserId === currentUserId) {
      return res.status(403).json({ success: false, error: 'Cannot revoke your own session.' });
    }

    const targetRoleCode = await getAccountRoleCodeByUserId(targetUserId);
    if (targetRoleCode === 'ADM') {
      return res.status(403).json({ success: false, error: 'Cannot revoke admin sessions.' });
    }

    const deleted = await Session.destroy({ where: { id: session.id } });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    return res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.revokeAllSessions = async (req, res) => {
  try {
    const rawUserId = req.body?.userId;
    let where = {};
    if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
      const userId = Number(rawUserId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid userId' });
      }
      const currentUserId = Number(req.user?.userId);
      if (Number.isFinite(currentUserId) && currentUserId > 0 && userId === currentUserId) {
        return res.status(403).json({ success: false, error: 'Cannot revoke your own sessions.' });
      }
      const targetRoleCode = await getAccountRoleCodeByUserId(userId);
      if (targetRoleCode === 'ADM') {
        return res.status(403).json({ success: false, error: 'Cannot revoke admin sessions.' });
      }
      where = { userId };
    } else {
      const adminUserRows = await sequelize.query(
        "SELECT user_id AS userId FROM ACCOUNT WHERE type = 'ADM'",
        { type: sequelize.QueryTypes.SELECT }
      );
      const adminUserIds = adminUserRows
        .map((row) => Number(row.userId))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (adminUserIds.length > 0) {
        where = { userId: { [Op.notIn]: adminUserIds } };
      }
    }

    const deleted = await Session.destroy({ where });
    return res.json({
      success: true,
      message: 'Sessions revoked successfully',
      revokedCount: deleted,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const loadAiModels = async () => {
  let modelConfig;
  try {
    modelConfig = await SystemConfig.findOne({ where: { key: 'aiModels' } });
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return [];
    throw error;
  }
  if (!modelConfig?.value) return [];
  try {
    const parsed = JSON.parse(modelConfig.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const loadAiModelCatalog = async () => {
  let modelConfig;
  try {
    modelConfig = await SystemConfig.findOne({ where: { key: 'aiModelCatalog' } });
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return [];
    throw error;
  }
  if (!modelConfig?.value) return [];
  try {
    const parsed = JSON.parse(modelConfig.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const saveAiModelCatalog = async (models) => {
  try {
    await upsertConfig('aiModelCatalog', JSON.stringify(models), 'AI model catalog by provider');
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return;
    throw error;
  }
};

const saveAiModels = async (models) => {
  try {
    await upsertConfig('aiModels', JSON.stringify(models), 'AI model registry');
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return;
    throw error;
  }
};

const loadAiDefaultByFeature = async () => {
  let defaultConfig;
  try {
    defaultConfig = await SystemConfig.findOne({ where: { key: 'aiDefaultModelByFeature' } });
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return {};
    throw error;
  }
  if (!defaultConfig?.value) return {};
  try {
    const parsed = JSON.parse(defaultConfig.value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const saveAiDefaultByFeature = async (defaults) => {
  try {
    await upsertConfig('aiDefaultModelByFeature', JSON.stringify(defaults), 'Default AI model per feature');
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return;
    throw error;
  }
};

exports.getAiModels = async (_req, res) => {
  try {
    const models = await loadAiModels();
    const catalog = await loadAiModelCatalog();
    const defaults = await loadAiDefaultByFeature();
    return res.json({ success: true, models, catalog, defaults });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.getAiModelCatalog = async (_req, res) => {
  try {
    const catalog = await loadAiModelCatalog();
    return res.json({ success: true, catalog });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.upsertAiModelCatalogEntry = async (req, res) => {
  try {
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const modelId = String(req.body?.modelId || '').trim();
    const labelRaw = req.body?.label;
    const label = labelRaw == null ? modelId : String(labelRaw).trim();
    const enabledStr = toBooleanString(req.body?.enabled);
    const enabled = enabledStr == null ? true : enabledStr === 'true';

    if (!provider || !modelId) {
      return res.status(400).json({ success: false, error: 'provider and modelId are required' });
    }
    if (!['groq', 'local'].includes(provider)) {
      return res.status(400).json({ success: false, error: "provider must be 'groq' or 'local'" });
    }

    const catalog = await loadAiModelCatalog();
    const existingIndex = catalog.findIndex(
      (item) =>
        String(item.provider || '').toLowerCase() === provider &&
        String(item.modelId || '').trim() === modelId
    );
    const next = { provider, modelId, label: label || modelId, enabled, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) catalog[existingIndex] = { ...catalog[existingIndex], ...next };
    else catalog.push(next);
    await saveAiModelCatalog(catalog);
    return res.json({ success: true, entry: next, catalog });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.deleteAiModelCatalogEntry = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const q = req.query || {};
    const provider = String(body.provider ?? q.provider ?? '').trim().toLowerCase();
    const modelId = String(body.modelId ?? q.modelId ?? '').trim();
    if (!provider || !modelId) {
      return res.status(400).json({ success: false, error: 'provider and modelId are required' });
    }

    const catalog = await loadAiModelCatalog();
    const nextCatalog = catalog.filter(
      (item) =>
        !(
          String(item.provider || '').toLowerCase() === provider &&
          String(item.modelId || '').trim() === modelId
        )
    );
    if (nextCatalog.length === catalog.length) {
      return res.status(404).json({ success: false, error: 'Catalog entry not found' });
    }
    await saveAiModelCatalog(nextCatalog);

    // Also remove any feature-model rows bound to this catalog item.
    const models = await loadAiModels();
    const nextModels = models.filter(
      (m) =>
        !(
          String(m.provider || '').toLowerCase() === provider &&
          String(m.modelId || '').trim() === modelId
        )
    );
    if (nextModels.length !== models.length) {
      await saveAiModels(nextModels);
      const defaults = await loadAiDefaultByFeature();
      let changed = false;
      Object.keys(defaults || {}).forEach((featureKey) => {
        const d = defaults[featureKey];
        if (
          d &&
          String(d.provider || '').toLowerCase() === provider &&
          String(d.modelId || '').trim() === modelId
        ) {
          delete defaults[featureKey];
          changed = true;
        }
      });
      if (changed) await saveAiDefaultByFeature(defaults);
    }

    return res.json({ success: true, catalog: nextCatalog, models: await loadAiModels(), defaults: await loadAiDefaultByFeature() });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.upsertAiModel = async (req, res) => {
  try {
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const modelId = String(req.body?.modelId || '').trim();
    const enabled = toBooleanString(req.body?.enabled);

    if (!provider || !modelId || enabled === null) {
      return res.status(400).json({ success: false, error: 'provider, modelId, and enabled are required' });
    }

    const featureScope = req.body?.featureScope
      ? String(req.body.featureScope).trim().toLowerCase()
      : 'chat';

    const models = await loadAiModels();
    const existingIndex = models.findIndex(
      (model) => model.provider === provider && model.modelId === modelId && model.featureScope === featureScope
    );
    const next = {
      provider,
      modelId,
      featureScope,
      enabled: enabled === 'true',
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      models[existingIndex] = { ...models[existingIndex], ...next };
    } else {
      models.push(next);
    }
    await saveAiModels(models);
    return res.json({ success: true, model: next });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.setAiDefaultModel = async (req, res) => {
  try {
    const feature = String(req.body?.feature || '').trim().toLowerCase();
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const modelId = String(req.body?.modelId || '').trim();

    if (!feature || !provider || !modelId) {
      return res.status(400).json({ success: false, error: 'feature, provider, and modelId are required' });
    }

    const models = await loadAiModels();
    const match = models.find(
      (model) =>
        model.provider === provider &&
        model.modelId === modelId &&
        model.featureScope === feature &&
        model.enabled === true
    );
    if (!match) {
      return res.status(400).json({ success: false, error: 'Default model must be enabled for the selected feature' });
    }

    const defaults = await loadAiDefaultByFeature();
    defaults[feature] = { provider, modelId };
    await saveAiDefaultByFeature(defaults);
    return res.json({ success: true, defaults });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.deleteAiModel = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const q = req.query || {};
    const provider = String(body.provider ?? q.provider ?? '').trim().toLowerCase();
    const modelId = String(body.modelId ?? q.modelId ?? '').trim();
    const featureScope = String(body.featureScope ?? q.featureScope ?? '').trim().toLowerCase();

    if (!provider || !modelId || !featureScope) {
      return res.status(400).json({
        success: false,
        error: 'provider, modelId, and featureScope are required (JSON body or query string)',
      });
    }

    const models = await loadAiModels();
    const next = models.filter(
      (m) =>
        !(
          String(m.provider || '').toLowerCase() === provider &&
          String(m.modelId || '').trim() === modelId &&
          String(m.featureScope || '').toLowerCase() === featureScope
        )
    );

    if (next.length === models.length) {
      return res.status(404).json({ success: false, error: 'AI model entry not found' });
    }

    await saveAiModels(next);

    const defaults = await loadAiDefaultByFeature();
    const current = defaults[featureScope];
    if (
      current &&
      String(current.provider || '').toLowerCase() === provider &&
      String(current.modelId || '').trim() === modelId
    ) {
      delete defaults[featureScope];
      await saveAiDefaultByFeature(defaults);
    }

    const defaultsOut = await loadAiDefaultByFeature();
    return res.json({
      success: true,
      message: 'AI model entry removed',
      models: next,
      defaults: defaultsOut,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Lấy danh sách feature flags
exports.getFeatures = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name, status, feature_group AS featureGroup, system_id AS systemId
       FROM FEATURE
       ORDER BY feature_group ASC, name ASC, id ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const normalized = (rows || []).map((r) => ({
      ...r,
      status: Number(r.status) === 1 ? 1 : 0,
    }));

    const total = normalized.length;
    const enabled = normalized.filter((r) => Number(r.status) === 1).length;
    const disabled = total - enabled;

    res.json({
      success: true,
      stats: { total, enabled, disabled },
      features: normalized,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Bật/tắt 1 feature
exports.updateFeatureStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid feature id' });
    }

    const raw = req.body?.status;
    const statusNum =
      raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true'
        ? 1
        : raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false'
          ? 0
          : null;
    if (statusNum === null) {
      return res.status(400).json({ success: false, error: 'Status must be boolean (0/1 or true/false)' });
    }

    await sequelize.query(
      `UPDATE FEATURE SET status = :status WHERE id = :id`,
      { replacements: { status: statusNum, id }, type: sequelize.QueryTypes.UPDATE }
    );

    const [row] = await sequelize.query(
      `SELECT id, name, status, feature_group AS featureGroup, system_id AS systemId
       FROM FEATURE
       WHERE id = :id
       LIMIT 1`,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!row) {
      return res.status(404).json({ success: false, error: 'Feature not found' });
    }

    res.json({
      success: true,
      feature: {
        ...row,
        status: Number(row.status) === 1 ? 1 : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Controller quản lý cấu hình hệ thống: lấy và cập nhật các thiết lập như số user đồng thời tối đa và thời gian timeout
