const router = require('express').Router();
const SystemConfigController = require('../controllers/systemConfigController');

router.get('/', SystemConfigController.getConfig);
router.put('/', SystemConfigController.updateConfig);
router.get('/features', SystemConfigController.getFeatures);
router.put('/features/:id/status', SystemConfigController.updateFeatureStatus);

module.exports = router;

// Routes quản lý cấu hình hệ thống: GET để lấy cấu hình, PUT để cập nhật
