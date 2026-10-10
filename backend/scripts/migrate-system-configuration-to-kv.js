/**
 * Idempotent migration: add key/value columns to SYSTEM_CONFIGURATION if missing,
 * seed CONFIG_DEFAULTS rows, optionally map legacy rate_limit/access_limit into global keys.
 *
 * Run from backend/: node scripts/migrate-system-configuration-to-kv.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { fromDist } = require('./lib/fromDist');
const { QueryTypes } = require('sequelize');
const sequelize = fromDist('common/database');
const defineSystemConfig = fromDist('models/SystemConfig');
const { CONFIG_DEFAULTS } = fromDist('config/systemConfigurationContract');

const SystemConfig = defineSystemConfig(sequelize);

async function columnExists(tableName, columnName) {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME AS col FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col LIMIT 1`,
    { replacements: { table: tableName, col: columnName }, type: QueryTypes.SELECT }
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function getColumnMetadata(tableName, columnName) {
  const rows = await sequelize.query(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col LIMIT 1`,
    { replacements: { table: tableName, col: columnName }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function addColumnIfMissing(name, ddl) {
  if (await columnExists('SYSTEM_CONFIGURATION', name)) {
    return false;
  }
  await sequelize.query(`ALTER TABLE SYSTEM_CONFIGURATION ADD COLUMN ${ddl}`);
  return true;
}

async function ensureKeyIndex() {
  const rows = await sequelize.query(
    `SELECT INDEX_NAME AS idx
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'SYSTEM_CONFIGURATION'
       AND COLUMN_NAME = 'key'`,
    { type: QueryTypes.SELECT }
  );
  if (Array.isArray(rows) && rows.length > 0) return false;
  await sequelize.query('CREATE UNIQUE INDEX uq_system_configuration_key ON SYSTEM_CONFIGURATION (`key`)');
  return true;
}

async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS SYSTEM_CONFIGURATION (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(191) NULL,
      \`value\` LONGTEXT NULL,
      description TEXT NULL
    )
  `);
}

async function relaxLegacyRequiredColumns() {
  const legacyColumns = ['rate_limit', 'access_limit', 'updated_by', 'time'];
  const relaxed = [];
  for (const column of legacyColumns) {
    const meta = await getColumnMetadata('SYSTEM_CONFIGURATION', column);
    if (!meta) continue;
    const isNullable = String(meta.isNullable || '').toUpperCase() === 'YES';
    const hasDefault = meta.columnDefault !== null && meta.columnDefault !== undefined;
    if (isNullable || hasDefault) continue;
    await sequelize.query(
      `ALTER TABLE SYSTEM_CONFIGURATION MODIFY COLUMN \`${column}\` ${meta.columnType} NULL DEFAULT NULL`
    );
    relaxed.push(column);
  }
  return relaxed;
}

async function loadLegacyRateRow() {
  const hasRateLimit = await columnExists('SYSTEM_CONFIGURATION', 'rate_limit');
  const hasAccessLimit = await columnExists('SYSTEM_CONFIGURATION', 'access_limit');
  if (!hasRateLimit && !hasAccessLimit) return null;

  const hasTime = await columnExists('SYSTEM_CONFIGURATION', 'time');
  const orderBy = hasTime ? 'time DESC, id DESC' : 'id DESC';
  const rows = await sequelize.query(
    `SELECT rate_limit AS rateLimit, access_limit AS accessLimit
     FROM SYSTEM_CONFIGURATION
     ORDER BY ${orderBy}
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function seedDefaultsFromContract() {
  const entries = Object.entries(CONFIG_DEFAULTS);
  let inserted = 0;

  for (const [key, value] of entries) {
    const existing = await SystemConfig.findOne({ where: { key }, attributes: ['id'] });
    if (existing) continue;
    await SystemConfig.create({
      key,
      value: String(value),
      description: `System configuration for ${key}`,
    });
    inserted += 1;
  }
  return inserted;
}

async function migrateLegacyGlobalRateLimit() {
  const row = await loadLegacyRateRow();
  if (!row) return false;

  const parsed = Number.parseInt(String(row.accessLimit ?? row.rateLimit ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;

  const existing = await SystemConfig.findOne({
    where: { key: 'globalRateLimitRequests' },
    attributes: ['id'],
  });
  if (existing) return false;

  await SystemConfig.create({
    key: 'globalRateLimitRequests',
    value: String(parsed),
    description: 'System configuration for globalRateLimitRequests (migrated from legacy row)',
  });
  return true;
}

async function main() {
  await ensureTable();
  const relaxedLegacyColumns = await relaxLegacyRequiredColumns();

  const changedColumns = [];
  if (await addColumnIfMissing('key', '`key` VARCHAR(191) NULL')) changedColumns.push('key');
  if (await addColumnIfMissing('value', '`value` LONGTEXT NULL')) changedColumns.push('value');
  if (await addColumnIfMissing('description', 'description TEXT NULL')) changedColumns.push('description');

  const createdIndex = await ensureKeyIndex();
  const migratedLegacyGlobalLimit = await migrateLegacyGlobalRateLimit();
  const insertedDefaults = await seedDefaultsFromContract();

  console.log('[system-config-migration] completed', {
    changedColumns,
    relaxedLegacyColumns,
    createdIndex,
    migratedLegacyGlobalLimit,
    insertedDefaults,
  });
}

main()
  .catch((error) => {
    console.error('[system-config-migration] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
