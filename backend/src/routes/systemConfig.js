const router = require('express').Router();
const SystemConfigController = require('../controllers/systemConfigController');
const authenticateToken = require('../middleware/authMiddleware');

const requireAdmin = (req, res, next) => {
  if (!req.user || String(req.user.role).toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  return next();
};

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', SystemConfigController.getConfig);
router.put('/', SystemConfigController.updateConfig);
router.get('/sessions', SystemConfigController.getSessions);
router.delete('/sessions/:id', SystemConfigController.revokeSession);
router.post('/sessions/revoke-all', SystemConfigController.revokeAllSessions);
router.get('/features', SystemConfigController.getFeatures);
router.put('/features/:id/status', SystemConfigController.updateFeatureStatus);
router.get('/ai-models', SystemConfigController.getAiModels);
router.put('/ai-models', SystemConfigController.upsertAiModel);
router.delete('/ai-models', SystemConfigController.deleteAiModel);
router.put('/ai-models/default', SystemConfigController.setAiDefaultModel);

module.exports = router;

// Routes quản lý cấu hình hệ thống: GET để lấy cấu hình, PUT để cập nhật
