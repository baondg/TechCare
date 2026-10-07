const { isLegacySystemConfigSchemaError } = require('../../config/systemConfigurationContract');
const { SystemConfig, toBooleanString, upsertConfig } = require('./configStore');

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
