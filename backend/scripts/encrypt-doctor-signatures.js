/**
 * One-time migration: encrypt existing plaintext DOCTOR.signature values.
 * Run from backend/: node scripts/encrypt-doctor-signatures.js
 *
 * Requires IMAGE_ENCRYPTION_KEY (32-byte key, base64) in .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { QueryTypes } = require('sequelize');
const sequelize = require('../src/common/database');
const { encryptField, isEncrypted } = require('../src/common/fieldEncryption');

(async () => {
  await sequelize.authenticate();

  const rows = await sequelize.query(
    `SELECT doctor_id AS doctorId, signature
     FROM DOCTOR
     WHERE signature IS NOT NULL AND TRIM(signature) != ''`,
    { type: QueryTypes.SELECT }
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows || []) {
    const sig = row.signature;
    if (!sig || isEncrypted(sig)) {
      skipped += 1;
      continue;
    }
    const encrypted = encryptField(String(sig));
    await sequelize.query(
      'UPDATE DOCTOR SET signature = :signature WHERE doctor_id = :doctorId',
      {
        replacements: { signature: encrypted, doctorId: row.doctorId },
        type: QueryTypes.UPDATE,
      }
    );
    updated += 1;
  }

  await sequelize.close();
  console.log(`encrypt-doctor-signatures: updated=${updated} skipped=${skipped}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
