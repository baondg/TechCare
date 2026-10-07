const patientRepository = require('../repositories/patientRepository');
const medicalRecordRepository = require('../repositories/medicalRecordRepository');
const logger = require('../common/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

/**
 * Patient portal health info (/api/health-info): vital-sign records (MEDICAL_RECORD) plus blood type,
 * allergies (PATIENT.allergic_info JSON) and medical history (PATIENT.medical_history JSON).
 */

const PATIENT_BLOOD_TYPES = new Set(['A+', 'B+', 'AB+', 'O+', 'A-', 'B-', 'AB-', 'O-']);
const ALLERGY_FIELDS = ['drugAllergies', 'foodAllergies', 'otherAllergies'];
const HISTORY_FIELDS = ['chronicConditions', 'pastSurgeries', 'familyHistory', 'pastIllnesses', 'vaccinations', 'substanceAbuse'];

const toPatientBloodType = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  return PATIENT_BLOOD_TYPES.has(s) ? s : null;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toBloodPressure = (sys, dia) => {
  const s = toNullableNumber(sys);
  const d = toNullableNumber(dia);
  if (s === null && d === null) return null;
  return `${s ?? 0}/${d ?? 0}`;
};

/** A JSON column as an object ({} when empty or broken). */
const parseJsonColumn = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (err) {
      logger.error({ err }, 'JSON parse error');
      return {};
    }
  }
  return {};
};

/** `{ field: array }` for each field (non-arrays become []). */
const listsFrom = (body, fields) => Object.fromEntries(fields.map((f) => [f, Array.isArray(body[f]) ? body[f] : []]));

const normalizeRecordStatus = (value) => {
  const raw = String(value || '').toLowerCase();
  return raw === 'confirmed' || raw === 'signed' ? 'confirmed' : 'draft';
};

/** A MEDICAL_RECORD as the portal shows it. */
const toHealthRecord = (r) => {
  const [sys, dia] = r.blood_pressure ? r.blood_pressure.split('/') : [0, 0];
  const h = parseFloat(r.height) || 0;
  const w = parseFloat(r.weight) || 0;
  return {
    id: r.id,
    height: h,
    weight: w,
    bmi: h > 0 ? +(w / (h / 100) ** 2).toFixed(1) : 0,
    bloodPressureSys: parseInt(sys, 10) || 0,
    bloodPressureDia: parseInt(dia, 10) || 0,
    heartRate: r.heart_rate,
    respiratoryRate: r.respiratory_rate || 0,
    temperature: r.temperature,
    spo2: r.spo2,
    currentSymptoms: r.condition || '',
    status: normalizeRecordStatus(r.status),
    updatedAt: r.time,
    createdAt: r.time,
    updatedBy: 'Patient',
  };
};

/** Vital-sign columns from the body (blank / non-numeric values become null). */
const vitalsFrom = (body) => ({
  spo2: toNullableNumber(body.spo2),
  heart_rate: toNullableNumber(body.heartRate),
  blood_pressure: toBloodPressure(body.bloodPressureSys, body.bloodPressureDia),
  temperature: toNullableNumber(body.temperature),
  respiratory_rate: toNullableNumber(body.respiratoryRate),
});

/** The patient (by USER id) when the signed-in user is that patient or an admin. */
async function requireOwnPatient(user, userIdParam) {
  const userId = Number(userIdParam);
  if (user.userId !== userId && user.role !== 'ADM') throw new ForbiddenError('Forbidden');
  const patient = await patientRepository.findPatientByUserId(userId);
  if (!patient) throw new NotFoundError('Patient not found');
  return patient;
}

async function requireDraftRecord(patient, recordId, action) {
  const record = await medicalRecordRepository.findForPatient(recordId, patient.patient_id);
  if (!record) throw new NotFoundError('Medical record not found');
  if (normalizeRecordStatus(record.status) !== 'draft') {
    throw new BadRequestError(`Only draft records can be ${action}`);
  }
  return record;
}

/**
 * The signed-in patient's health info: latest record merged with blood type, allergies and history,
 * plus every record (newest first). The route's :userId is not used.
 */
async function getOwnHealthInfo(user) {
  const patient = await patientRepository.findPatientWithMedicalRecordsByUserId(user.userId);
  if (!patient) throw new NotFoundError('Patient not found');
  const history = patient.medicalRecords
    .map(toHealthRecord)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const allergies = parseJsonColumn(patient.allergic_info);
  const medicalHistory = parseJsonColumn(patient.medical_history);
  return {
    healthInfo: {
      ...(history[0] || {}),
      bloodType: patient.blood_type,
      ...Object.fromEntries(ALLERGY_FIELDS.map((f) => [f, allergies[f] || []])),
      ...Object.fromEntries(HISTORY_FIELDS.map((f) => [f, medicalHistory[f] || []])),
    },
    history,
  };
}

/** New record (now) + blood type / allergies / medical history replaced from the body. */
async function createHealthInfo(user, userIdParam, body) {
  const patient = await requireOwnPatient(user, userIdParam);
  const record = await medicalRecordRepository.create({
    patient_id: patient.patient_id,
    time: new Date(),
    condition: body.currentSymptoms || '',
    weight: toNullableNumber(body.weight) ?? 0.1,
    height: toNullableNumber(body.height) ?? 0.1,
    ...vitalsFrom(body),
    status: normalizeRecordStatus(body.status),
  });

  const bloodType = toPatientBloodType(body.bloodType);
  const allergies = listsFrom(body, ALLERGY_FIELDS);
  await patientRepository.updatePatient(patient, {
    ...(bloodType ? { blood_type: bloodType } : {}),
    allergic_info: JSON.stringify(allergies),
    medical_history: JSON.stringify(listsFrom(body, HISTORY_FIELDS)),
  });
  return { ...toHealthRecord(record), bloodType: bloodType || patient.blood_type, ...allergies };
}

/**
 * Edits a draft record (`body.id`; time reset to now; height / weight / status kept when omitted)
 * and replaces blood type / allergies / medical history, like create.
 */
async function updateHealthInfo(user, userIdParam, body) {
  const patient = await requireOwnPatient(user, userIdParam);
  const record = await requireDraftRecord(patient, body.id, 'edited');
  await medicalRecordRepository.update(record, {
    condition: body.currentSymptoms || '',
    weight: toNullableNumber(body.weight) ?? record.weight,
    height: toNullableNumber(body.height) ?? record.height,
    ...vitalsFrom(body),
    time: new Date(),
    status: body.status ? normalizeRecordStatus(body.status) : record.status,
  });

  const bloodType = toPatientBloodType(body.bloodType);
  const allergies = listsFrom(body, ALLERGY_FIELDS);
  const medicalHistory = listsFrom(body, HISTORY_FIELDS);
  await patientRepository.updatePatient(patient, {
    ...(bloodType ? { blood_type: bloodType } : {}),
    allergic_info: JSON.stringify(allergies),
    medical_history: JSON.stringify(medicalHistory),
  });
  return { ...toHealthRecord(record), bloodType: bloodType || patient.blood_type, ...allergies, ...medicalHistory };
}

async function confirmHealthInfo(user, userIdParam, recordIdParam) {
  const patient = await requireOwnPatient(user, userIdParam);
  const record = await requireDraftRecord(patient, Number(recordIdParam), 'confirmed');
  await medicalRecordRepository.update(record, { status: 'confirmed', time: new Date() });
  return { id: record.id, status: 'confirmed' };
}

/** @returns {Promise<number>} how many of the patient's records were deleted */
async function deleteHealthInfos(user, userIdParam, ids) {
  const patient = await requireOwnPatient(user, userIdParam);
  if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestError('No record IDs provided');
  return medicalRecordRepository.destroyForPatient(patient.patient_id, ids);
}

module.exports = { getOwnHealthInfo, createHealthInfo, updateHealthInfo, confirmHealthInfo, deleteHealthInfos };
