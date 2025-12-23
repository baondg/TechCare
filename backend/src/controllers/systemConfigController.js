const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);

// Lấy tất cả cấu hình hệ thống
exports.getConfig = async (req, res) => {
  try {
    const configs = await SystemConfig.findAll();
    const configMap = {};
    configs.forEach(config => {
      configMap[config.key] = config.value;
    });
    
    // Set default values if not exists
    const defaults = {
      maxConcurrentUsers: '500',
      sessionTimeoutMinutes: '30'
    };
    
    res.json({
      success: true,
      config: { ...defaults, ...configMap }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Cập nhật cấu hình hệ thống
exports.updateConfig = async (req, res) => {
  try {
    const { maxConcurrentUsers, sessionTimeoutMinutes } = req.body;
    
    if (maxConcurrentUsers !== undefined) {
      await SystemConfig.upsert({
        key: 'maxConcurrentUsers',
        value: String(maxConcurrentUsers),
        description: 'Maximum number of concurrent users allowed'
      });
    }
    
    if (sessionTimeoutMinutes !== undefined) {
      await SystemConfig.upsert({
        key: 'sessionTimeoutMinutes',
        value: String(sessionTimeoutMinutes),
        description: 'Session timeout in minutes'
      });
    }
    
    res.json({
      success: true,
      message: 'System configuration updated successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Controller quản lý cấu hình hệ thống: lấy và cập nhật các thiết lập như số user đồng thời tối đa và thời gian timeout
