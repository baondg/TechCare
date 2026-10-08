const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');

const SystemConfig = defineSystemConfig(sequelize);

/** Every stored key/value row. */
async function listEntries() {
  const rows = await SystemConfig.findAll();
  return rows.map((row) => ({ key: row.key, value: row.value }));
}

/** Stored value of `key`, or null when absent / empty. */
async function getValue(key) {
  const row = await SystemConfig.findOne({ where: { key } });
  return row?.value || null;
}

async function upsertValue(key, value, description = null) {
  await SystemConfig.upsert({
    key,
    value: String(value),
    description: description || `System configuration for ${key}`,
  });
}

/**
 * `{ key: value }` of the stored rows among `keys` (raw SQL: on schemas without the key/value
 * columns it fails with ER_BAD_FIELD_ERROR / ER_NO_SUCH_TABLE, which the rate limiter relies on).
 */
async function getValuesByKeys(keys) {
  const rows = await sequelize.query(
    `SELECT \`key\` AS configKey, value
     FROM SYSTEM_CONFIGURATION
     WHERE \`key\` IN (:keys)`,
    { replacements: { keys }, type: QueryTypes.SELECT }
  );
  return Object.fromEntries(rows.map((row) => [row.configKey, row.value]));
}

/** Newest row of the legacy (pre key/value) schema: `{ rateLimit, accessLimit }`, or null. */
async function findLatestLegacyLimits() {
  const rows = await sequelize.query(
    `SELECT rate_limit AS rateLimit, access_limit AS accessLimit
     FROM SYSTEM_CONFIGURATION
     ORDER BY time DESC, id DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

module.exports = { listEntries, getValue, upsertValue, getValuesByKeys, findLatestLegacyLimits };
