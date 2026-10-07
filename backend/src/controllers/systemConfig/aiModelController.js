const aiModelService = require('../../services/systemConfig/aiModelService');
const { asyncHandler } = require('../../common/asyncHandler');

/** DELETE accepts its fields in the JSON body or the query string (body wins). */
function bodyOrQuery(req, fields) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query || {};
  return Object.fromEntries(fields.map((f) => [f, body[f] ?? query[f]]));
}

/** GET /api/system-config/ai-models */
exports.getAiModels = asyncHandler(async (_req, res) => {
  res.json({ success: true, ...(await aiModelService.getAll()) });
});

/** GET /api/system-config/ai-model-catalog */
exports.getAiModelCatalog = asyncHandler(async (_req, res) => {
  res.json({ success: true, catalog: await aiModelService.getCatalog() });
});

/** PUT /api/system-config/ai-model-catalog — `{ provider, modelId, label?, enabled? }` */
exports.upsertAiModelCatalogEntry = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await aiModelService.upsertCatalogEntry(req.body)) });
});

/** DELETE /api/system-config/ai-model-catalog — `provider`, `modelId` */
exports.deleteAiModelCatalogEntry = asyncHandler(async (req, res) => {
  const result = await aiModelService.deleteCatalogEntry(bodyOrQuery(req, ['provider', 'modelId']));
  res.json({ success: true, ...result });
});

/** PUT /api/system-config/ai-models — `{ provider, modelId, enabled, featureScope? }` */
exports.upsertAiModel = asyncHandler(async (req, res) => {
  res.json({ success: true, model: await aiModelService.upsertModel(req.body) });
});

/** PUT /api/system-config/ai-models/default — `{ feature, provider, modelId }` */
exports.setAiDefaultModel = asyncHandler(async (req, res) => {
  res.json({ success: true, defaults: await aiModelService.setDefaultModel(req.body) });
});

/** DELETE /api/system-config/ai-models — `provider`, `modelId`, `featureScope` */
exports.deleteAiModel = asyncHandler(async (req, res) => {
  const result = await aiModelService.deleteModel(bodyOrQuery(req, ['provider', 'modelId', 'featureScope']));
  res.json({ success: true, message: 'AI model entry removed', ...result });
});
