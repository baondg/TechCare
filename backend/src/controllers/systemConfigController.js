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

// Lấy danh sách feature flags
exports.getFeatures = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name, status, feature_group AS featureGroup, system_id AS systemId
       FROM FEATURE
       ORDER BY feature_group ASC, name ASC, id ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const normalized = (rows || []).map((r) => ({
      ...r,
      status: Number(r.status) === 1 ? 1 : 0,
    }));

    const total = normalized.length;
    const enabled = normalized.filter((r) => Number(r.status) === 1).length;
    const disabled = total - enabled;

    res.json({
      success: true,
      stats: { total, enabled, disabled },
      features: normalized,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Bật/tắt 1 feature
exports.updateFeatureStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid feature id' });
    }

    const raw = req.body?.status;
    const statusNum =
      raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true'
        ? 1
        : raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false'
          ? 0
          : null;
    if (statusNum === null) {
      return res.status(400).json({ success: false, error: 'Status must be boolean (0/1 or true/false)' });
    }

    await sequelize.query(
      `UPDATE FEATURE SET status = :status WHERE id = :id`,
      { replacements: { status: statusNum, id }, type: sequelize.QueryTypes.UPDATE }
    );

    const [row] = await sequelize.query(
      `SELECT id, name, status, feature_group AS featureGroup, system_id AS systemId
       FROM FEATURE
       WHERE id = :id
       LIMIT 1`,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!row) {
      return res.status(404).json({ success: false, error: 'Feature not found' });
    }

    res.json({
      success: true,
      feature: {
        ...row,
        status: Number(row.status) === 1 ? 1 : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Controller quản lý cấu hình hệ thống: lấy và cập nhật các thiết lập như số user đồng thời tối đa và thời gian timeout
