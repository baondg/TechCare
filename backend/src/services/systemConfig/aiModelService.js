const systemConfigRepository = require('../../repositories/systemConfigRepository');
const { isLegacySystemConfigSchemaError } = require('../../config/systemConfigurationContract');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { toBooleanString } = require('../../validators/systemConfigSchemas');

/**
 * AI model settings live in SYSTEM_CONFIGURATION as JSON:
 *   aiModelCatalog          [{ provider, modelId, label, enabled, updatedAt }]  — models that exist
 *   aiModels                [{ provider, modelId, featureScope, enabled, updatedAt }] — per feature
 *   aiDefaultModelByFeature { [feature]: { provider, modelId } }
 * On a legacy schema reads return empty values and writes are skipped silently.
 */
const STORE = {
  catalog: { key: 'aiModelCatalog', description: 'AI model catalog by provider', empty: () => [], isValid: Array.isArray },
  models: { key: 'aiModels', description: 'AI model registry', empty: () => [], isValid: Array.isArray },
  defaults: {
    key: 'aiDefaultModelByFeature',
    description: 'Default AI model per feature',
    empty: () => ({}),
    isValid: (v) => !!v && typeof v === 'object',
  },
};

async function load({ key, empty, isValid }) {
  let raw;
  try {
    raw = await systemConfigRepository.getValue(key);
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return empty();
    throw error;
  }
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : empty();
  } catch (_error) {
    return empty();
  }
}

async function save({ key, description }, value) {
  try {
    await systemConfigRepository.upsertValue(key, JSON.stringify(value), description);
  } catch (error) {
    if (isLegacySystemConfigSchemaError(error)) return;
    throw error;
  }
}

const lower = (v) => String(v || '').toLowerCase();
const trimmed = (v) => String(v || '').trim();
const sameModel = (item, provider, modelId) => lower(item.provider) === provider && trimmed(item.modelId) === modelId;

async function getAll() {
  const models = await load(STORE.models);
  const catalog = await load(STORE.catalog);
  const defaults = await load(STORE.defaults);
  return { models, catalog, defaults };
}

async function getCatalog() {
  return load(STORE.catalog);
}

/** Adds or updates a catalog entry. `enabled` defaults to true; `label` to the model id. */
async function upsertCatalogEntry(body) {
  const provider = String(body?.provider || '').trim().toLowerCase();
  const modelId = String(body?.modelId || '').trim();
  const label = body?.label == null ? modelId : String(body.label).trim();
  const enabledStr = toBooleanString(body?.enabled);
  const enabled = enabledStr == null ? true : enabledStr === 'true';

  if (!provider || !modelId) throw new BadRequestError('provider and modelId are required');
  if (!['groq', 'local'].includes(provider)) throw new BadRequestError("provider must be 'groq' or 'local'");

  const catalog = await load(STORE.catalog);
  const index = catalog.findIndex((item) => sameModel(item, provider, modelId));
  const entry = { provider, modelId, label: label || modelId, enabled, updatedAt: new Date().toISOString() };
  if (index >= 0) catalog[index] = { ...catalog[index], ...entry };
  else catalog.push(entry);
  await save(STORE.catalog, catalog);
  return { entry, catalog };
}

/** Removes a catalog entry and every per-feature model / default that points at it. */
async function deleteCatalogEntry(input) {
  const provider = String(input.provider ?? '').trim().toLowerCase();
  const modelId = String(input.modelId ?? '').trim();
  if (!provider || !modelId) throw new BadRequestError('provider and modelId are required');

  const catalog = await load(STORE.catalog);
  const nextCatalog = catalog.filter((item) => !sameModel(item, provider, modelId));
  if (nextCatalog.length === catalog.length) throw new NotFoundError('Catalog entry not found');
  await save(STORE.catalog, nextCatalog);

  const models = await load(STORE.models);
  const nextModels = models.filter((m) => !sameModel(m, provider, modelId));
  if (nextModels.length !== models.length) {
    await save(STORE.models, nextModels);
    const defaults = await load(STORE.defaults);
    let changed = false;
    for (const feature of Object.keys(defaults || {})) {
      const d = defaults[feature];
      if (d && sameModel(d, provider, modelId)) {
        delete defaults[feature];
        changed = true;
      }
    }
    if (changed) await save(STORE.defaults, defaults);
  }

  return { catalog: nextCatalog, models: await load(STORE.models), defaults: await load(STORE.defaults) };
}

/** Enables / disables a model for one feature (default feature: chat). */
async function upsertModel(body) {
  const provider = String(body?.provider || '').trim().toLowerCase();
  const modelId = String(body?.modelId || '').trim();
  const enabled = toBooleanString(body?.enabled);
  if (!provider || !modelId || enabled === null) {
    throw new BadRequestError('provider, modelId, and enabled are required');
  }
  const featureScope = body?.featureScope ? String(body.featureScope).trim().toLowerCase() : 'chat';

  const models = await load(STORE.models);
  const index = models.findIndex(
    (m) => m.provider === provider && m.modelId === modelId && m.featureScope === featureScope
  );
  const model = { provider, modelId, featureScope, enabled: enabled === 'true', updatedAt: new Date().toISOString() };
  if (index >= 0) models[index] = { ...models[index], ...model };
  else models.push(model);
  await save(STORE.models, models);
  return model;
}

/** Sets a feature's default model; it must be enabled for that feature. */
async function setDefaultModel(body) {
  const feature = String(body?.feature || '').trim().toLowerCase();
  const provider = String(body?.provider || '').trim().toLowerCase();
  const modelId = String(body?.modelId || '').trim();
  if (!feature || !provider || !modelId) {
    throw new BadRequestError('feature, provider, and modelId are required');
  }

  const models = await load(STORE.models);
  const enabledForFeature = models.some(
    (m) => m.provider === provider && m.modelId === modelId && m.featureScope === feature && m.enabled === true
  );
  if (!enabledForFeature) throw new BadRequestError('Default model must be enabled for the selected feature');

  const defaults = await load(STORE.defaults);
  defaults[feature] = { provider, modelId };
  await save(STORE.defaults, defaults);
  return defaults;
}

/** Removes a model from one feature, and that feature's default if it pointed at it. */
async function deleteModel(input) {
  const provider = String(input.provider ?? '').trim().toLowerCase();
  const modelId = String(input.modelId ?? '').trim();
  const featureScope = String(input.featureScope ?? '').trim().toLowerCase();
  if (!provider || !modelId || !featureScope) {
    throw new BadRequestError('provider, modelId, and featureScope are required (JSON body or query string)');
  }

  const models = await load(STORE.models);
  const next = models.filter((m) => !(sameModel(m, provider, modelId) && lower(m.featureScope) === featureScope));
  if (next.length === models.length) throw new NotFoundError('AI model entry not found');
  await save(STORE.models, next);

  const defaults = await load(STORE.defaults);
  const current = defaults[featureScope];
  if (current && sameModel(current, provider, modelId)) {
    delete defaults[featureScope];
    await save(STORE.defaults, defaults);
  }

  return { models: next, defaults: await load(STORE.defaults) };
}

module.exports = {
  getAll,
  getCatalog,
  upsertCatalogEntry,
  deleteCatalogEntry,
  upsertModel,
  setDefaultModel,
  deleteModel,
};
