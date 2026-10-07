const patientRecordRepository = require('../../repositories/patientRecordRepository');
const nurseCheckInRepository = require('../../repositories/nurseCheckInRepository');
const cacheService = require('../cacheService');
const logger = require('../../common/logger');
const { config } = require('../../config/env');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { PATIENT_RECORD_CACHE_TTL_SECONDS, patientRecordCacheKey } = require('./patientRecordCache');

const isPositive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;

function bmiFromHeightWeightCm(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w) return null;
  const heightInM = h / 100;
  return +(w / heightInM ** 2).toFixed(1);
}

/** "N days" under 30 days, "N months" under 24 months, else the year count as a string. */
function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  const diffDays = Math.floor((today - birth) / (1000 * 60 * 60 * 24));
  const diffMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  const diffYears = today.getFullYear() - birth.getFullYear();
  if (diffDays < 30) return `${diffDays} days`;
  if (diffMonths < 24) return `${diffMonths} months`;
  return `${diffYears}`;
}

// ─── Patient list ───

/** userId → patientPk for the users that are patients. */
async function mapUserIdsToPatientPks(userIds) {
  const map = new Map();
  if (!userIds.length) return map;
  for (const row of await patientRecordRepository.listPatientPksByUserIds(userIds)) {
    if (row.userId != null && row.patientPk != null) map.set(Number(row.userId), Number(row.patientPk));
  }
  return map;
}

/** patientPk → latest standalone diagnosis row. */
async function mapLatestDiagnoses(patientPks) {
  const map = new Map();
  if (!patientPks.length) return map;
  for (const row of await patientRecordRepository.listLatestDiagnosisByPatientPks(patientPks)) {
    if (row.patientPk != null) map.set(Number(row.patientPk), row);
  }
  return map;
}

/** patientPk → BMI of the latest MEDICAL_RECORD (null when height / weight missing). */
async function mapLatestBmi(patientPks) {
  const map = new Map();
  if (!patientPks.length) return map;
  for (const row of await patientRecordRepository.listLatestBodyMeasuresByPatientPks(patientPks)) {
    if (row.patientPk != null) map.set(Number(row.patientPk), bmiFromHeightWeightCm(row.height, row.weight));
  }
  return map;
}

/**
 * Patient list for the doctor portal, newest first, with latest diagnosis / doctor / BMI / department.
 * @param query `{ search?, page?, limit? }` (limit 1..100, default 50)
 */
async function listPatients({ search, page = 1, limit = 50 }) {
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));

  const { count, rows: users } = await patientRecordRepository.listPatientUsers({
    search,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  });

  const userIds = users.map((u) => u.id);
  const deptByUserId = new Map();
  if (userIds.length > 0) {
    for (const r of await patientRecordRepository.listCurrentDepartmentByUserIds(userIds)) {
      deptByUserId.set(Number(r.userId), r.inDepartment != null ? String(r.inDepartment) : null);
    }
  }

  const userToPatientPk = await mapUserIdsToPatientPks(userIds);
  const patientPks = [...new Set(userIds.map((uid) => userToPatientPk.get(uid)).filter((pk) => pk != null))];
  const [diagByPatientPk, bmiByPatientPk] = await Promise.all([
    mapLatestDiagnoses(patientPks),
    mapLatestBmi(patientPks),
  ]);

  const patients = users.map((user) => {
    const p = user.toJSON();
    const patientPk = userToPatientPk.get(p.id) ?? null;
    const latestDiagnosis = patientPk != null ? diagByPatientPk.get(patientPk) || null : null;
    return {
      id: p.id,
      username: p.ACCOUNT?.username || '',
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.sex,
      age: calculateAge(p.dob),
      latestDiagnosis: latestDiagnosis
        ? { icd10: latestDiagnosis.icd10 || '', interpretation: latestDiagnosis.interpretation || '' }
        : null,
      latestVisit: latestDiagnosis?.visitTime || null,
      doctor: latestDiagnosis?.doctorName || null,
      bmi: patientPk != null ? bmiByPatientPk.get(patientPk) ?? null : null,
      inDepartment: deptByUserId.get(p.id) ?? null,
    };
  });

  return {
    patients,
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
  };
}

// ─── Single patient record ───

async function findLatestDiagnosis(patientPk) {
  if (!isPositive(patientPk)) return null;
  return patientRecordRepository.findLatestDiagnosis(Number(patientPk));
}

async function findLatestBmi(patientPk) {
  if (!isPositive(patientPk)) return null;
  const row = await patientRecordRepository.findLatestBodyMeasures(Number(patientPk));
  return row ? bmiFromHeightWeightCm(row.height, row.weight) : null;
}

/** Latest TREATMENT department, falling back to the latest appointment room's department. */
async function findCurrentDepartment(patientPk) {
  if (!isPositive(patientPk)) return { inDepartment: null, inDeptId: null };
  const [treatment, appointment] = await Promise.all([
    patientRecordRepository.findLatestTreatmentDepartment(Number(patientPk)),
    patientRecordRepository.findLatestAppointmentDepartment(Number(patientPk)),
  ]);
  if (treatment?.inDeptId != null) {
    return {
      inDepartment: treatment.inDepartment != null ? String(treatment.inDepartment) : null,
      inDeptId: Number(treatment.inDeptId),
    };
  }
  return {
    inDepartment: appointment?.inDepartment != null ? String(appointment.inDepartment) : null,
    inDeptId: appointment?.inDeptId != null ? Number(appointment.inDeptId) : null,
  };
}

/** Today's scheduled appointment (nurse view) and whether the patient has been checked in. */
async function findTodayAppointment(patientPk) {
  const pk = Number(patientPk);
  if (!Number.isFinite(pk) || pk <= 0) return null;
  const [ar] = (await nurseCheckInRepository.listNurseBookedTodayForPatient(pk)) || [];
  if (!ar) return null;
  const wallTimeRaw = ar.wallTime != null ? String(ar.wallTime).split('.')[0] : '';
  const regimenId = ar.regimenId != null ? Number(ar.regimenId) : null;
  let checkedIn = false;
  if (Number.isFinite(regimenId) && regimenId > 0) {
    checkedIn = Boolean(await nurseCheckInRepository.findOpenRegimenForPatient(regimenId, pk));
  }
  const roomId = ar.roomId != null ? Number(ar.roomId) : null;
  return {
    appointmentId: Number(ar.id),
    timeDisplay: wallTimeRaw.length >= 5 ? wallTimeRaw.slice(0, 5) : '',
    checkedIn,
    roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : null,
    roomName: ar.roomName != null ? String(ar.roomName) : '',
  };
}

/**
 * EMR header for a patient (route id: OP-padded or numeric USER.id / patient_id), cached per
 * patient for PATIENT_RECORD_CACHE_TTL_SECONDS.
 * @returns the full response payload `{ success, patient }`
 */
async function getPatientRecord(patientIdParam) {
  const startedAt = Date.now();
  const routeId = Number(String(patientIdParam || '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(routeId) || routeId <= 0) throw new BadRequestError('Invalid patient id');

  const p = await patientRecordRepository.findPatientHeader(routeId);
  if (!p) throw new NotFoundError('Patient not found');

  const patientPk = p.patientPk != null ? Number(p.patientPk) : null;
  const cacheKey = patientPk ? patientRecordCacheKey(patientPk) : null;
  const profile = (cache) => {
    if (config.profileHotpaths) logger.info({ ms: Date.now() - startedAt, patientPk, cache }, 'perf.getPatient');
  };
  if (cacheKey) {
    const cached = await cacheService.getJson(cacheKey);
    if (cached) {
      profile('hit');
      return cached;
    }
  }

  const [latestDiagnosis, bmi, dept, todayAppointment] = await Promise.all([
    findLatestDiagnosis(patientPk),
    findLatestBmi(patientPk),
    findCurrentDepartment(patientPk),
    findTodayAppointment(patientPk),
  ]);

  const payload = {
    success: true,
    patient: {
      id: p.id,
      patientPk: patientPk != null ? patientPk : null,
      username: p.username || '',
      firstName: p.first_name,
      lastName: p.last_name,
      idCard: p.idcard || null,
      phone: p.tel || null,
      gender: p.sex,
      dateOfBirth: p.dob || null,
      age: calculateAge(p.dob),
      latestDiagnosis: latestDiagnosis
        ? {
            icd10: latestDiagnosis.icd10 || '',
            interpretation: latestDiagnosis.interpretation || '',
            department: latestDiagnosis.department || '',
            doctorName: latestDiagnosis.doctorName || '',
          }
        : null,
      /** Derived from latest TREATMENT.dept_id, fallback APPOINTMENT room department */
      inDepartment: dept.inDepartment || null,
      inDeptId: dept.inDeptId,
      bmi,
      healthInsuranceId: p.healthInsuranceId || null,
      healthInsuranceExpiredDate: p.healthInsuranceExpiredDate || null,
      bloodType: null,
      todayAppointment,
    },
  };
  if (cacheKey) await cacheService.setJson(cacheKey, payload, PATIENT_RECORD_CACHE_TTL_SECONDS);
  profile('miss');
  return payload;
}

module.exports = { listPatients, getPatientRecord };
