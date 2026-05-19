/**
 * Run: node scripts/ensure-doctor-signature-column.js (from backend/)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sequelize = require('../src/common/database');
const { ensureDoctorSignatureColumn } = require('../src/common/ensureDoctorSignatureColumn');

(async () => {
  await sequelize.authenticate();
  await ensureDoctorSignatureColumn(sequelize);
  await sequelize.close();
  console.log('ensure-doctor-signature-column: OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
