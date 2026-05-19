/**
 * Idempotent: ensure DOCTOR.signature exists for prescription PDF / profile features.
 */
const { QueryTypes } = require('sequelize');

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
async function ensureDoctorSignatureColumn(sequelize) {
  if (!(await tableExists(sequelize, 'DOCTOR'))) {
    console.warn(
      '[db] DOCTOR table missing; skip signature column migration. Import schema (e.g. database_description.sql) or run migrations.'
    );
    return;
  }
  const exists = await columnExists(sequelize, 'DOCTOR', 'signature');
  if (exists) return;
  await sequelize.query('ALTER TABLE DOCTOR ADD COLUMN signature LONGTEXT NULL');
  console.log('[db] Added column DOCTOR.signature');
}

module.exports = { ensureDoctorSignatureColumn };
