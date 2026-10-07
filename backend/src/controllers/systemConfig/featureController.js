const sequelize = require('../../common/database');

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
    res.status(500).json({ success: false, error: 'Internal server error' });
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
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
