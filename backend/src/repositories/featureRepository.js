const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

const FEATURE_COLUMNS_SQL = 'SELECT id, name, status, feature_group AS featureGroup, system_id AS systemId';

async function listFeatures() {
  return sequelize.query(
    `${FEATURE_COLUMNS_SQL}
       FROM FEATURE
       ORDER BY feature_group ASC, name ASC, id ASC`,
    { type: QueryTypes.SELECT }
  );
}

async function findFeature(id) {
  const [row] = await sequelize.query(
    `${FEATURE_COLUMNS_SQL}
       FROM FEATURE
       WHERE id = :id
       LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** @param {0 | 1} status */
async function setFeatureStatus(id, status) {
  await sequelize.query('UPDATE FEATURE SET status = :status WHERE id = :id', {
    replacements: { status, id },
    type: QueryTypes.UPDATE,
  });
}

module.exports = { listFeatures, findFeature, setFeatureStatus };
