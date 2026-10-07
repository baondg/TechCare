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

module.exports = { listEntries, getValue, upsertValue };
