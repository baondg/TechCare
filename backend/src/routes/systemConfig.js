const router = require('express').Router();
const configController = require('../controllers/systemConfig/configController');
const sessionController = require('../controllers/systemConfig/sessionController');
const featureController = require('../controllers/systemConfig/featureController');
const aiModelController = require('../controllers/systemConfig/aiModelController');
const authenticateToken = require('../middleware/authMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const { validate } = require('../middleware/validate');
const {
  featureIdParams,
  featureStatusBody,
  sessionIdParams,
  revokeAllSessionsBody,
} = require('../validators/systemConfigSchemas');

router.use(authenticateToken);
router.use(authorizeCapability('admin.console', { message: 'Admin access required' }));

router.get('/', configController.getConfig);
router.put('/', configController.updateConfig);
router.get('/sessions', sessionController.getSessions);
router.delete('/sessions/:id', validate({ params: sessionIdParams }), sessionController.revokeSession);
router.post('/sessions/revoke-all', validate({ body: revokeAllSessionsBody }), sessionController.revokeAllSessions);
router.get('/features', featureController.getFeatures);
router.put(
  '/features/:id/status',
  validate({ params: featureIdParams, body: featureStatusBody }),
  featureController.updateFeatureStatus
);
router.get('/ai-model-catalog', aiModelController.getAiModelCatalog);
router.put('/ai-model-catalog', aiModelController.upsertAiModelCatalogEntry);
router.delete('/ai-model-catalog', aiModelController.deleteAiModelCatalogEntry);
router.get('/ai-models', aiModelController.getAiModels);
router.put('/ai-models', aiModelController.upsertAiModel);
router.delete('/ai-models', aiModelController.deleteAiModel);
router.put('/ai-models/default', aiModelController.setAiDefaultModel);

module.exports = router;

// Routes quản lý cấu hình hệ thống: GET để lấy cấu hình, PUT để cập nhật
