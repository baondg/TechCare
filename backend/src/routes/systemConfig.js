const router = require('express').Router();
const configController = require('../controllers/systemConfig/configController');
const sessionController = require('../controllers/systemConfig/sessionController');
const featureController = require('../controllers/systemConfig/featureController');
const aiModelController = require('../controllers/systemConfig/aiModelController');
const authenticateToken = require('../middleware/authMiddleware');

const requireAdmin = (req, res, next) => {
  if (!req.user || String(req.user.role).toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  return next();
};

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', configController.getConfig);
router.put('/', configController.updateConfig);
router.get('/sessions', sessionController.getSessions);
router.delete('/sessions/:id', sessionController.revokeSession);
router.post('/sessions/revoke-all', sessionController.revokeAllSessions);
router.get('/features', featureController.getFeatures);
router.put('/features/:id/status', featureController.updateFeatureStatus);
router.get('/ai-model-catalog', aiModelController.getAiModelCatalog);
router.put('/ai-model-catalog', aiModelController.upsertAiModelCatalogEntry);
router.delete('/ai-model-catalog', aiModelController.deleteAiModelCatalogEntry);
router.get('/ai-models', aiModelController.getAiModels);
router.put('/ai-models', aiModelController.upsertAiModel);
router.delete('/ai-models', aiModelController.deleteAiModel);
router.put('/ai-models/default', aiModelController.setAiDefaultModel);

module.exports = router;

// Routes quản lý cấu hình hệ thống: GET để lấy cấu hình, PUT để cập nhật
