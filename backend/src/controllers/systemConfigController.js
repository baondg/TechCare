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
      sessionTimeoutMinutes: '30',
      rateLimitRequests: '100',
      rateLimitWindowMinutes: '15',
      apiRateLimitRequests: '60',
      apiRateLimitWindowMinutes: '1'
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
    const { 
      maxConcurrentUsers, 
      sessionTimeoutMinutes,
      rateLimitRequests,
      rateLimitWindowMinutes,
      apiRateLimitRequests,
      apiRateLimitWindowMinutes
    } = req.body;
    
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
    
    if (rateLimitRequests !== undefined) {
      await SystemConfig.upsert({
        key: 'rateLimitRequests',
        value: String(rateLimitRequests),
        description: 'Maximum number of requests per time window (general)'
      });
    }
    
    if (rateLimitWindowMinutes !== undefined) {
      await SystemConfig.upsert({
        key: 'rateLimitWindowMinutes',
        value: String(rateLimitWindowMinutes),
        description: 'Rate limit time window in minutes (general)'
      });
    }
    
    if (apiRateLimitRequests !== undefined) {
      await SystemConfig.upsert({
        key: 'apiRateLimitRequests',
        value: String(apiRateLimitRequests),
        description: 'Maximum number of API requests per time window'
      });
    }
    
    if (apiRateLimitWindowMinutes !== undefined) {
      await SystemConfig.upsert({
        key: 'apiRateLimitWindowMinutes',
        value: String(apiRateLimitWindowMinutes),
        description: 'API rate limit time window in minutes'
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
