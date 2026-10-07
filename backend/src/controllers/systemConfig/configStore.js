const sequelize = require('../../common/database');
const defineSystemConfig = require('../../models/SystemConfig');

const SystemConfig = defineSystemConfig(sequelize);

const toBooleanString = (value) => {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 'true';
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 'false';
  return null;
};

const upsertConfig = async (key, value, description = null) => {
  await SystemConfig.upsert({
    key,
    value: String(value),
    description: description || `System configuration for ${key}`,
  });
};

module.exports = {
  SystemConfig,
  toBooleanString,
  upsertConfig,
};
