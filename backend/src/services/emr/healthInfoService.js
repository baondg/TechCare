const medicalRecordRepository = require('../../repositories/medicalRecordRepository');
const patientRepository = require('../../repositories/patientRepository');
const logger = require('../../common/logger');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolveCanonicalPatientIdFromEmrParam } = require('./patientRouteResolver');

const normalizeMedicalRecordStatus = (value) => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'confirmed' || raw === 'signed') return 'confirmed';
  return 'draft';
};

function parseOptionalIntHealth(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalFloatHealth(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map client health-info body → MEDICAL_RECORD columns (create). */
function coerceMedicalRecordCreatePayload(body) {
  const b = body && typeof body === 'object' ? body : {};
  const condition =
    String(b.condition ?? b.currentSymptoms ?? b.symptoms ?? '').trim() || 'No symptoms recorded';
  const time = b.time ? new Date(b.time) : new Date();
  if (Number.isNaN(time.getTime())) {
    throw new BadRequestError('Invalid time');
  }

  const height = Number(b.height);
  const weight = Number(b.weight);
  if (!Number.isFinite(height) || height < 0.1) {
    throw new BadRequestError('Height is required and must be a positive number');
  }
  if (!Number.isFinite(weight) || weight < 0.1) {
    throw new BadRequestError('Weight is required and must be a positive number');
  }

  const sys = b.bloodPressureSys ?? b.blood_pressure_sys;
  const dia = b.bloodPressureDia ?? b.blood_pressure_dia;
  let blood_pressure =
    b.blood_pressure != null && String(b.blood_pressure).trim() !== '' ? String(b.blood_pressure) : null;
  if (!blood_pressure && sys != null && sys !== '' && dia != null && dia !== '') {
    blood_pressure = `${sys}/${dia}`;
  }

  return {
    time,
    condition,
    height,
    weight,
    blood_pressure,
    heart_rate: parseOptionalIntHealth(b.heartRate ?? b.heart_rate),
    respiratory_rate: parseOptionalIntHealth(b.respiratoryRate ?? b.respiratory_rate),
    temperature: parseOptionalFloatHealth(b.temperature),
    spo2: parseOptionalFloatHealth(b.spo2),
    status: normalizeMedicalRecordStatus(b.status),
  };
}

/** Partial map for MEDICAL_RECORD update (draft only). */
function coerceMedicalRecordUpdatePayload(body) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (b.condition != null || b.currentSymptoms != null || b.symptoms != null) {
    const c = String(b.condition ?? b.currentSymptoms ?? b.symptoms ?? '').trim();
    if (c) out.condition = c;
  }
  if (b.time != null && b.time !== '') {
    const t = new Date(b.time);
    if (!Number.isNaN(t.getTime())) out.time = t;
  }
  if (b.height != null && b.height !== '') {
    const h = Number(b.height);
    if (Number.isFinite(h) && h >= 0.1) out.height = h;
  }
  if (b.weight != null && b.weight !== '') {
    const w = Number(b.weight);
    if (Number.isFinite(w) && w >= 0.1) out.weight = w;
  }
  const sys = b.bloodPressureSys ?? b.blood_pressure_sys;
  const dia = b.bloodPressureDia ?? b.blood_pressure_dia;
  if (b.blood_pressure != null && String(b.blood_pressure).trim() !== '') {
    out.blood_pressure = String(b.blood_pressure);
  } else if (sys != null && sys !== '' && dia != null && dia !== '') {
    out.blood_pressure = `${sys}/${dia}`;
  }
  const hr = parseOptionalIntHealth(b.heartRate ?? b.heart_rate);
  if (hr != null) out.heart_rate = hr;
  const rr = parseOptionalIntHealth(b.respiratoryRate ?? b.respiratory_rate);
  if (rr != null) out.respiratory_rate = rr;
  const temp = parseOptionalFloatHealth(b.temperature);
  if (temp != null) out.temperature = temp;
  const sp = parseOptionalFloatHealth(b.spo2);
  if (sp != null) out.spo2 = sp;
  if (b.status != null) out.status = normalizeMedicalRecordStatus(b.status);
  return out;
}

async function requirePatientId(patientIdParam) {
  const pid = await resolveCanonicalPatientIdFromEmrParam(patientIdParam);
  if (!pid) throw new NotFoundError('Patient not found');
  return pid;
}

/** Parses a JSON column that may already be an object; {} when unreadable. */
function parseJsonColumn(val) {
  try {
    return typeof val === 'string' ? JSON.parse(val) : val || {};
  } catch (e) {
    // Don't log `val`: it is patient allergy/history data.
    logger.warn({ err: e }, 'Failed to parse patient JSON column');
    return {};
  }
}

/** Latest vital-signs record plus the patient's blood type / allergies / history. */
async function getLatest(patientIdParam) {
  const pid = await requirePatientId(patientIdParam);
  const healthInfo = await medicalRecordRepository.findLatestForPatient(pid);
  const patient = await patientRepository.findPatientById(pid);
  if (!patient) throw new NotFoundError('Patient not found');
  return {
    healthInfo: healthInfo?.toJSON() || null,
    patientInfo: {
      blood_type: patient.blood_type,
      allergic_info: parseJsonColumn(patient.allergic_info),
      medical_history: parseJsonColumn(patient.medical_history),
    },
  };
}

/** Vital-signs history, newest first (`page` from 1, `limit` default 10). */
async function getHistory(patientIdParam, { page = 1, limit = 10 }) {
  const pid = await requirePatientId(patientIdParam);
  const offset = (page - 1) * limit;
  const { count, rows } = await medicalRecordRepository.listForPatient(pid, {
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
  return {
    history: rows,
    pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) },
  };
}

async function create(patientIdParam, body) {
  const pid = await resolveCanonicalPatientIdFromEmrParam(patientIdParam);
  const patient = pid ? await patientRepository.findPatientById(pid) : null;
  if (!patient) throw new NotFoundError('Patient not found');
  return medicalRecordRepository.create({ patient_id: pid, ...coerceMedicalRecordCreatePayload(body) });
}

async function requireRecord(patientIdParam, id) {
  const pid = await requirePatientId(patientIdParam);
  const record = await medicalRecordRepository.findForPatient(id, pid);
  if (!record) throw new NotFoundError('Health info record not found');
  return record;
}

/** Edits a draft record (confirmed ones are read-only). */
async function update(patientIdParam, id, body) {
  const record = await requireRecord(patientIdParam, id);
  if (normalizeMedicalRecordStatus(record.status) !== 'draft') {
    throw new BadRequestError('Only draft records can be edited');
  }
  const changes = coerceMedicalRecordUpdatePayload(body);
  if (Object.keys(changes).length > 0) await medicalRecordRepository.update(record, changes);
  return record;
}

async function remove(patientIdParam, id) {
  await medicalRecordRepository.destroy(await requireRecord(patientIdParam, id));
}

/** Locks a draft record as confirmed (stamped now). */
async function confirm(patientIdParam, id) {
  const record = await requireRecord(patientIdParam, Number(id));
  if (normalizeMedicalRecordStatus(record.status) !== 'draft') {
    throw new BadRequestError('Only draft records can be confirmed');
  }
  await medicalRecordRepository.update(record, { status: 'confirmed', time: new Date() });
  return record;
}

module.exports = { getLatest, getHistory, create, update, remove, confirm };
