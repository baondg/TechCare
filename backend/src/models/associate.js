/**
 * Central Sequelize associations for TechCare — keep in sync with `database_description.sql`
 * and raw SQL in controllers (controllers/doctor/*, appointmentController) and services/emr/*.
 *
 * - REGIMEN carries `disease_id`; TREATMENT does not.
 * - TEST_DETAIL has no numeric_value; use textual `result`.
 *
 * Appointment / Session / standalone JSON tables (`diagnoses`, `prescriptions`) stay separate;
 * associations here focus on relational MySQL core + portal profile graph.
 */

function applySequelizeAssociations() {
  const Account = require('./Account');
  const User = require('./Users');
  const Patient = require('./Patient');
  const Relative = require('./Relative');
  const HealthInsurance = require('./HealthInsurance');
  const MedicalRecord = require('./MedicalRecord');

  const Disease = require('./Disease');
  const Regimen = require('./Regimen');
  const Treatment = require('./Treatment');
  const EmrOrder = require('./EmrOrder');
  const LabTest = require('./LabTest');
  const TestDetail = require('./TestDetail');

  /* Side-effect: register models Prescription-internal links, etc. */
  require('./Appointment');
  require('./Diagnosis');
  require('./Prescription');

  /* ========== Portal (auth / profile) ========== */
  Account.hasOne(User, { foreignKey: 'id', sourceKey: 'user_id' });
  User.belongsTo(Account, { foreignKey: 'id', targetKey: 'user_id' });

  Patient.hasOne(Relative, { foreignKey: 'patient_id', sourceKey: 'patient_id' });
  Relative.belongsTo(Patient, { foreignKey: 'patient_id', targetKey: 'patient_id' });

  User.hasOne(Patient, {
    foreignKey: 'user_id',
    sourceKey: 'id',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Patient.belongsTo(User, {
    foreignKey: 'user_id',
    targetKey: 'id',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });

  Patient.hasOne(HealthInsurance, { foreignKey: 'patient_id', as: 'insurance' });
  HealthInsurance.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

  Patient.hasMany(MedicalRecord, { foreignKey: 'patient_id', as: 'medicalRecords' });
  MedicalRecord.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

  /* ========== EMR core (MySQL normalized schema) ========== */
  Patient.hasMany(Regimen, { foreignKey: 'patient_id', as: 'regimens' });
  Regimen.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

  Disease.hasMany(Regimen, { foreignKey: 'disease_id', as: 'regimens' });
  Regimen.belongsTo(Disease, { foreignKey: 'disease_id', as: 'disease' });

  Regimen.hasMany(Treatment, { foreignKey: 'regimen_id', as: 'treatments' });
  Treatment.belongsTo(Regimen, { foreignKey: 'regimen_id', as: 'regimen' });

  Treatment.hasMany(EmrOrder, { foreignKey: 'treatment_id', as: 'orders' });
  EmrOrder.belongsTo(Treatment, { foreignKey: 'treatment_id', as: 'treatment' });

  /* TEST.id joins ORDER.id (same PK). */
  EmrOrder.hasOne(LabTest, { foreignKey: 'id', sourceKey: 'id', as: 'labTest' });
  LabTest.belongsTo(EmrOrder, { foreignKey: 'id', targetKey: 'id', as: 'order' });

  LabTest.hasMany(TestDetail, { foreignKey: 'test_id', as: 'details' });
  TestDetail.belongsTo(LabTest, { foreignKey: 'test_id', as: 'test' });

  /*
   * Optional future: Appointment.belongsTo(Regimen) when Appointment model columns match APPOINTMENT
   * in database_description.sql; Treatment.belongsTo(Doctor) when a DOCTOR model is added here.
   */
}

module.exports = { applySequelizeAssociations };
