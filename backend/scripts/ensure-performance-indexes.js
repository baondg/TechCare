/**
 * Idempotent helper: add indexes that speed up batched patient list + appointment ownership.
 * Run from backend/: node scripts/ensure-performance-indexes.js
 * Safe to re-run; skips if index name already exists (MySQL ER_DUP_KEYNAME).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sequelize = require('../src/common/database');

const INDEXES = [
  ['idx_patient_user_id', 'CREATE INDEX idx_patient_user_id ON PATIENT (user_id)'],
  [
    'idx_medical_record_patient_time',
    'CREATE INDEX idx_medical_record_patient_time ON MEDICAL_RECORD (patient_id, time)',
  ],
  ['idx_appointment_patient_id', 'CREATE INDEX idx_appointment_patient_id ON APPOINTMENT (patient_id)'],
  ['idx_regimen_patient_id', 'CREATE INDEX idx_regimen_patient_id ON REGIMEN (patient_id)'],
  ['idx_treatment_regimen_time', 'CREATE INDEX idx_treatment_regimen_time ON TREATMENT (regimen_id, time, id, dept_id)'],
  ['idx_appointment_patient_time', 'CREATE INDEX idx_appointment_patient_time ON APPOINTMENT (patient_id, time, id, room_id, status)'],
  ['idx_appointment_patient_hotread', 'CREATE INDEX idx_appointment_patient_hotread ON APPOINTMENT (patient_id, time, status, doctor_confirmed, doctor_id, room_id)'],
  ['idx_health_insurance_patient', 'CREATE INDEX idx_health_insurance_patient ON HEALTH_INSURANCE (patient_id)'],
];

async function main() {
  for (const [name, sql] of INDEXES) {
    try {
      await sequelize.query(sql);
      console.log(`OK: ${name}`);
    } catch (e) {
      const code = e?.original?.errno ?? e?.parent?.errno;
      const msg = String(e?.message || e);
      if (code === 1061 || msg.includes('Duplicate key name')) {
        console.log(`Skip (exists): ${name}`);
      } else {
        console.error(`Fail: ${name}`, msg);
        throw e;
      }
    }
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
