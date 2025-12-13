const router = require('express').Router();
const SystemConfigController = require('../controllers/systemConfigController');

router.get('/', SystemConfigController.getConfig);
router.put('/', SystemConfigController.updateConfig);

module.exports = router;

// Routes quản lý cấu hình hệ thống: GET để lấy cấu hình, PUT để cập nhật
