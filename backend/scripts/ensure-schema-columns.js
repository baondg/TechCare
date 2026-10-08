/**
 * Run: npm run db:ensure-columns (from backend/) — same as the server does at startup.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sequelize = require('../src/common/database');
const { ensureSchemaColumns } = require('../src/common/ensureSchemaColumns');

(async () => {
  await sequelize.authenticate();
  await ensureSchemaColumns(sequelize);
  await sequelize.close();
  console.log('ensure-schema-columns: OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
