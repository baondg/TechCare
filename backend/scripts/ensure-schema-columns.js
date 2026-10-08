/**
 * Run: npm run db:ensure-columns (from backend/, after `npm run build`) — same as the server
 * does at startup.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { fromDist } = require('./lib/fromDist');
const sequelize = fromDist('common/database');
const { ensureSchemaColumns } = fromDist('common/ensureSchemaColumns');

(async () => {
  await sequelize.authenticate();
  await ensureSchemaColumns(sequelize);
  await sequelize.close();
  console.log('ensure-schema-columns: OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
