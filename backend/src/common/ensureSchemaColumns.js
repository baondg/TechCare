/**
 * Idempotent: add the columns the code relies on that older databases lack. Runs at startup
 * (index.ts) and from `npm run db:ensure-columns`.
 */
const { QueryTypes } = require('sequelize');
const logger = require('./logger');

/** [table, column, definition, what needs it] */
const REQUIRED_COLUMNS = [
  ['DOCTOR', 'signature', 'LONGTEXT NULL', 'prescription PDF / profile signature'],
  ['ACCOUNT', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0', 'forced password change on next login'],
];

async function columnExists(sequelize, tableName, columnName) {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME AS col FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col LIMIT 1`,
    { replacements: { table: tableName, col: columnName }, type: QueryTypes.SELECT }
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function tableExists(sequelize, tableName) {
  const rows = await sequelize.query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table LIMIT 1`,
    { replacements: { table: tableName }, type: QueryTypes.SELECT }
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
async function ensureSchemaColumns(sequelize) {
  for (const [table, column, definition, purpose] of REQUIRED_COLUMNS) {
    if (!(await tableExists(sequelize, table))) {
      logger.warn(
        `[db] ${table} table missing; skip ${table}.${column} (${purpose}). Import schema (e.g. database_description.sql) or run migrations.`
      );
      continue;
    }
    if (await columnExists(sequelize, table, column)) continue;
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`[db] Added column ${table}.${column}`);
  }
}

module.exports = { ensureSchemaColumns, REQUIRED_COLUMNS };
