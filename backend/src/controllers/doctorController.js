const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const {
  isUnknownColumnError,
  selectPrescriptionRowsWithDurationFallback,
  insertMedicalPrescriptionCompat,
  insertPrescriptionDetailCompat,
  updateMedicalPrescriptionCompat,
  selectMedicalPrescriptionMetaCompat,
} = require('../common/prescriptionQueryCompat');
const {
  notifyPatientDoctorCover,
  notifyPatientDoctorAcceptedBooking,
  notifyPatientDoctorDeclinedBooking,
  notifyDepartmentDoctorsInboundClinicTransfer,
  notifyPatientAppointmentDoctorReassigned,
  notifyDoctorReceivedCoverAppointment,
} = require('../services/appointmentNotifications');
const fs = require('fs');
const path = require('path');
const Account = require('../models/Account');
const Appointment = require('../models/Appointment');
const Diagnosis = require('../models/Diagnosis');
const { Prescription, PrescriptionMedication } = require('../models/Prescription');
const User = require('../models/Users');
const HealthInfo = require('../models/MedicalRecord');
const Patient = require('../models/Patient');

function parseRoutePatientId(patientId) {
  const n = Number(String(patientId).replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeDateTimeForDb(value) {
  const s = String(value ?? '').trim()
  if (!s) return null

  // If timezone-aware (has Z or offset), format in UTC to avoid MySQL "Incorrect datetime value".
  if (/(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  }

  // Handle "YYYY-MM-DDTHH:mm:ss[.SSS]" or "YYYY-MM-DD HH:mm[:ss]" without timezone.
  const noT = s.replace('T', ' ')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(noT)) {
    return noT.replace(/\.\d+$/, '')
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(noT)) {
    return `${noT}:00`
  }

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function resolveDoctorDisplayName(req) {
  const { userId, username } = req.user;
  const u = await sequelize.query(
    'SELECT first_name, last_name FROM USER WHERE id = :id LIMIT 1',
    { replacements: { id: userId }, type: QueryTypes.SELECT }
  );
  if (u[0]) {
    const full = `${u[0].first_name || ''} ${u[0].last_name || ''}`.trim();
    if (full) return `Dr. ${full}`;
  }
  if (username) return `Dr. ${username}`;
  return `Doctor #${userId}`;
}

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
    const err = new Error('Invalid time');
    err.statusCode = 400;
    throw err;
  }

  const height = Number(b.height);
  const weight = Number(b.weight);
  if (!Number.isFinite(height) || height < 0.1) {
    const err = new Error('Height is required and must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(weight) || weight < 0.1) {
    const err = new Error('Weight is required and must be a positive number');
    err.statusCode = 400;
    throw err;
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

function normalizeJsonColumn(val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return null;
  }
}

function mapMedicalRecordRowToTrackingRow(row) {
  return {
    id: Number(row.id),
    updatedAt: row.time,
    bloodPressure: row.blood_pressure || '',
    pulse: Number(row.heart_rate) || 0,
    temperature: Number(row.temperature) || 0,
    weight: Number(row.weight) || 0,
    respiratoryRate: Number(row.respiratory_rate) || 0,
    spo2: Number(row.spo2) || 0,
    symptoms: row.condition || '',
  };
}

async function getDoctorIdByUserId(userId, transaction) {
  const row = await sequelize.query(
    'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row[0]?.doctor_id || null;
}

/** Scheduled / past appointments — lets technicians attach lab orders before any TREATMENT row exists. */
async function getDoctorIdFromPatientAppointments(patientPk, transaction) {
  const qOpts = { type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) };
  const [sched] = await sequelize.query(
    `SELECT doctor_id AS doctorId FROM APPOINTMENT
     WHERE patient_id = :patientPk AND status = 'scheduled'
     ORDER BY \`time\` DESC LIMIT 1`,
    { ...qOpts, replacements: { patientPk } }
  );
  if (sched?.doctorId != null) return Number(sched.doctorId);
  const [any] = await sequelize.query(
    `SELECT doctor_id AS doctorId FROM APPOINTMENT
     WHERE patient_id = :patientPk
     ORDER BY \`time\` DESC LIMIT 1`,
    { ...qOpts, replacements: { patientPk } }
  );
  return any?.doctorId != null ? Number(any.doctorId) : null;
}

/** Prefer logged-in user's DOCTOR row; else latest treating doctor; else doctor on patient's appointment. */
async function getDoctorIdForUserOrLatestForPatient(userId, patientId, transaction) {
  let doctorId = await getDoctorIdByUserId(userId, transaction);
  if (doctorId) return doctorId;
  const latestDoctor = await sequelize.query(
    `SELECT t.doctor_id
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  if (latestDoctor[0]?.doctor_id) return latestDoctor[0].doctor_id;
  return getDoctorIdFromPatientAppointments(patientId, transaction);
}

const MSG_NO_DOCTOR_OR_PRIOR_TREATMENT =
  'No doctor could be resolved for this lab order: the patient needs a scheduled appointment or a prior visit (treatment), or the action must be done by a user linked to a doctor profile.';

function normalizeMedicalPrescriptionDuration(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 7;
  return n;
}

function normalizePrescriptionLineDuration(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 7;
  return n;
}

/** MySQL INSERT raw query: first tuple element may be a number or ResultSetHeader. */
function mysqlInsertId(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v.insertId != null) return Number(v.insertId);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const PRESCRIPTION_DETAIL_UNITS = new Set([
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'drop',
  'cream',
  'ointment',
  'powder',
  'spray',
]);

function normalizePrescriptionDetailUnit(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (PRESCRIPTION_DETAIL_UNITS.has(s)) return s;
  if (s.includes('cap')) return 'capsule';
  if (s.includes('tab') || s === 'viên') return 'tablet';
  if (s.includes('syrup') || s.includes('siro')) return 'syrup';
  if (s.includes('inj') || s.includes('inject') || s.includes('tiêm')) return 'injection';
  if (s.includes('drop') || s.includes('nhỏ')) return 'drop';
  if (s.includes('cream') || s.includes('kem')) return 'cream';
  if (s.includes('oint') || s.includes('mỡ')) return 'ointment';
  if (s.includes('powder') || s.includes('bột')) return 'powder';
  if (s.includes('spray') || s.includes('xịt')) return 'spray';
  return 'tablet';
}

function clampPrescriptionUsage(raw) {
  const t = String(raw || '').trim() || 'Take as directed';
  return t.length > 100 ? t.slice(0, 100) : t;
}

function clampPrescriptionNote(raw) {
  if (raw == null || raw === '') return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.length > 150 ? t.slice(0, 150) : t;
}

/** TREATMENT rows tied to ORDER + (SURGERY|TEST|Rx|TRANSFERENCE) are not clinical diagnoses. */
const SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS = `
  AND NOT EXISTS (
    SELECT 1 FROM \`ORDER\` o
    WHERE o.treatment_id = t.id
      AND (
        EXISTS (SELECT 1 FROM SURGERY s WHERE s.id = o.id)
        OR EXISTS (SELECT 1 FROM TEST tst WHERE tst.id = o.id)
        OR EXISTS (SELECT 1 FROM MEDICAL_PRESCRIPTION rx WHERE rx.order_id = o.id)
        OR EXISTS (SELECT 1 FROM TRANSFERENCE tf WHERE tf.order_id = o.id)
      )
  )`;

async function getTechnicianIdByUserId(userId, transaction) {
  const row = await sequelize.query(
    'SELECT technician_id FROM TECHNICIAN WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row[0]?.technician_id || null;
}

async function ensureDisease(icd10, interpretation, transaction) {
  const found = await sequelize.query(
    'SELECT id FROM DISEASE WHERE icd_code = :icd LIMIT 1',
    { replacements: { icd: icd10 }, type: QueryTypes.SELECT, transaction }
  );
  if (found[0]?.id) return found[0].id;

  const [ins] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES (:icd, :description, 'General', NULL)`,
    {
      replacements: { icd: icd10, description: interpretation || icd10 },
      type: QueryTypes.INSERT,
      transaction
    }
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert DISEASE row');
  return id;
}

async function ensureRegimen(patientId, diseaseId, transaction) {
  const found = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND disease_id = :diseaseId
     ORDER BY id DESC LIMIT 1`,
    { replacements: { patientId, diseaseId }, type: QueryTypes.SELECT, transaction }
  );
  if (found[0]?.id) return found[0].id;

  const [ins] = await sequelize.query(
    `INSERT INTO REGIMEN (start, end, patient_id, disease_id)
     VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY), :patientId, :diseaseId)`,
    { replacements: { patientId, diseaseId }, type: QueryTypes.INSERT, transaction }
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert REGIMEN row');
  return id;
}

/** Nurse check-in leaves REGIMEN.end NULL until checkout — attach EMR orders to that encounter. */
async function getOpenRegimenIdForPatient(patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND \`end\` IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

async function createTreatmentForPatient({ patientId, doctorId, complaint, department, diseaseId, transaction }) {
  let regimenId = await getOpenRegimenIdForPatient(patientId, transaction);
  if (!regimenId) {
    regimenId = await ensureRegimen(patientId, diseaseId, transaction);
  }
  const repl = {
    complaint: complaint || 'General follow-up',
    type: department || 'General',
    regimenId,
    doctorId,
    diseaseId: diseaseId != null ? diseaseId : null,
  };
  try {
    const [ins] = await sequelize.query(
      `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id, disease_id)
       VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, NULL, :diseaseId)`,
      { replacements: repl, type: QueryTypes.INSERT, transaction }
    );
    const tid = mysqlInsertId(ins);
    if (tid == null) throw new Error('Failed to insert TREATMENT row');
    return tid;
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
    const [ins] = await sequelize.query(
      `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id)
       VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, NULL)`,
      {
        replacements: {
          complaint: repl.complaint,
          type: repl.type,
          regimenId: repl.regimenId,
          doctorId: repl.doctorId,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const tid = mysqlInsertId(ins);
    if (tid == null) throw new Error('Failed to insert TREATMENT row');
    return tid;
  }
}

/**
 * Latest standalone diagnosis for a patient. `userOrPatientPk` may be USER.id or PATIENT.patient_id.
 */
async function getLatestDiagnosisByPatientId(userOrPatientPk) {
  const n = Number(userOrPatientPk);
  if (!Number.isFinite(n) || n <= 0) return null;
  const [mapRow] = await sequelize.query(
    'SELECT patient_id AS pk FROM PATIENT WHERE user_id = :n OR patient_id = :n LIMIT 1',
    { replacements: { n }, type: QueryTypes.SELECT }
  );
  const patientPk = mapRow?.pk != null ? Number(mapRow.pk) : null;
  if (!patientPk) return null;
  const rows = await sequelize.query(
    `SELECT
       t.time AS visitTime,
       t.type AS department,
       t.\`condition\` AS complaint,
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE r.patient_id = :patientPk
     ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientPk }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

// ─── Helper: verify the doctor has access to this patient ───
async function verifyDoctorPatientAccess(doctorId, patientId) {
  // A doctor can access a patient if they have at least one appointment together
  const appointment = await Appointment.findOne({
    where: {
      userId: patientId,
      doctor: {
        [Op.ne]: null
      }
    }
  });
  // For now, allow any doctor to access any patient (they can see the patient list)
  // In production, you'd restrict based on assignments
  return true;
}

const calculateAge = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();

  const diffMs = today - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  const diffYears = today.getFullYear() - birth.getFullYear();

  if (diffDays < 30) {
    return `${diffDays} days`;        // < 30 ngày → hiển thị ngày
  } else if (diffMonths < 24) {
    return `${diffMonths} months`;    // < 24 tháng → hiển thị tháng
  } else {
    return `${diffYears}`;      // >= 24 tháng → hiển thị năm
  }
};

// ═══════════════════════════════════════════════
//  PATIENTS
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/patients
 * List all patients (users with role 'patient')
 */
exports.getPatients = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const where = {}

    if (search) {
      where[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: patients } = await User.findAndCountAll({
      include: [
        {
          model: Account,
          required: true,
          where: {
            type: 'PAT'
          },
          attributes: ['username']
        }
      ],
      attributes: ['id', 'email', 'first_name', 'last_name', 'dob', 'sex', 'idcard','tel',],
      order: [['id', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const userIds = patients.map((patient) => patient.id);
    const deptByUserId = new Map();
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const deptRows = await sequelize.query(
        `SELECT pt.user_id AS userId, dep.name AS inDepartment
         FROM PATIENT pt
         LEFT JOIN DEPARTMENT dep ON dep.id = pt.in_dept
         WHERE pt.user_id IN (${placeholders})`,
        { replacements: userIds, type: QueryTypes.SELECT }
      );
      for (const r of deptRows) {
        deptByUserId.set(Number(r.userId), r.inDepartment != null ? String(r.inDepartment) : null);
      }
    }

    // For each patient, get latest diagnosis and appointment info
    const enrichedPatients = await Promise.all(patients.map(async (patient) => {
    const p = patient.toJSON();

      const latestDiagnosis = await getLatestDiagnosisByPatientId(p.id);

      const medicalRecordPatientId = await resolveCanonicalPatientIdFromEmrParam(String(p.id));
      const healthInfo = medicalRecordPatientId
        ? await HealthInfo.findOne({
            where: { patient_id: medicalRecordPatientId },
            order: [['time', 'DESC']],
          })
        : null;

      const doctorFullName = latestDiagnosis?.doctorName || null;

      return {
        id: p.id,
        username: p.ACCOUNT?.username || "",
        firstName: p.first_name,
        lastName: p.last_name,
        gender: p.sex,
        age: calculateAge(p.dob),
        latestDiagnosis: latestDiagnosis
          ? {
              icd10: latestDiagnosis.icd10 || '',
              interpretation: latestDiagnosis.interpretation || ''
            }
          : null,
        latestVisit: latestDiagnosis?.visitTime || null,
        doctor: doctorFullName,
        bmi: healthInfo ? healthInfo.bmi : null,
        inDepartment: deptByUserId.get(p.id) ?? null
      };
    }));


    res.json({
      success: true,
      patients: enrichedPatients,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId
 * Get a single patient's basic info
 */
exports.getPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Medical staff can view patient details from EMR pages
    if (!["doctor", "admin", "nurse", "technician"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Lấy bệnh nhân
    const patient = await User.findOne({
      where: { id: Number(patientId.replace(/^OP0*/, ''))},
      attributes: ['id', 'email', 'first_name', 'last_name', 'dob', 'sex', 'idcard','tel',],
    });

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const p = patient.toJSON();

    const latestDiagnosis = await getLatestDiagnosisByPatientId(p.id);

    const medicalRecordPatientId = await resolveCanonicalPatientIdFromEmrParam(String(p.id));
    const healthInfo = medicalRecordPatientId
      ? await HealthInfo.findOne({
          where: { patient_id: medicalRecordPatientId },
          order: [['time', 'DESC']],
        })
      : null;

    let bmi = null;
      if (healthInfo) {
        const h = healthInfo.height; // cm
        const w = healthInfo.weight; // kg
        if (h && w) {
          const heightInM = h / 100;
          bmi = +(w / (heightInM ** 2)).toFixed(1); // 1 chữ số thập phân
        }
      }

    const patDeptRows = await sequelize.query(
      `SELECT dep.name AS inDepartment, pt.in_dept AS inDeptId
       FROM PATIENT pt
       LEFT JOIN DEPARTMENT dep ON dep.id = pt.in_dept
       WHERE pt.user_id = :uid
       LIMIT 1`,
      { replacements: { uid: p.id }, type: QueryTypes.SELECT }
    );
    const deptRow = patDeptRows[0];
    const inDepartment =
      deptRow?.inDepartment != null ? String(deptRow.inDepartment) : null;

    // HEALTH_INSURANCE.id based on PATIENT.patient_id (PATIENT.user_id = USER.id)
    let healthInsuranceId = null;
    let healthInsuranceExpiredDate = null;
    try {
      const patRow = await Patient.findOne({
        where: { user_id: p.id },
        attributes: ['patient_id'],
      });
      const pid = patRow?.patient_id;
      if (pid) {
        const hiRows = await sequelize.query(
          'SELECT id, expired_date FROM HEALTH_INSURANCE WHERE patient_id = :pid LIMIT 1',
          { replacements: { pid }, type: QueryTypes.SELECT }
        );
        healthInsuranceId = hiRows[0]?.id ?? null;
        healthInsuranceExpiredDate = hiRows[0]?.expired_date ?? null;
      }
    } catch (e) {
      // Don't block patient fetch if insurance lookup fails
      healthInsuranceId = null;
      healthInsuranceExpiredDate = null;
    }

    res.json({
      success: true,
      patient: {
        id: p.id,
        username: p.ACCOUNT?.username || "",
        firstName: p.first_name,
        lastName: p.last_name,
        gender: p.sex,
        dateOfBirth: p.dob || null,
        age: calculateAge(p.dob),
        latestDiagnosis: latestDiagnosis ? {
          icd10: latestDiagnosis.icd10 || '',
          interpretation: latestDiagnosis.interpretation || '',
          department: latestDiagnosis.department || '',
          doctorName: latestDiagnosis.doctorName || ''
        } : null,
        /** PATIENT.in_dept → DEPARTMENT.name */
        inDepartment: inDepartment || null,
        inDeptId: deptRow?.inDeptId != null ? Number(deptRow.inDeptId) : null,
        bmi: bmi,
        healthInsuranceId: healthInsuranceId || null,
        healthInsuranceExpiredDate: healthInsuranceExpiredDate || null,
        bloodType: healthInfo?.bloodType ?? null
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATIENT.patient_id from EMR route param (may be USER.id or PATIENT.patient_id in URL).
 */
async function resolveCanonicalPatientIdFromEmrParam(patientIdParam) {
  const n = Number(String(patientIdParam || '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const rows = await sequelize.query(
    `SELECT patient_id FROM PATIENT WHERE patient_id = :n OR user_id = :n LIMIT 1`,
    { replacements: { n }, type: QueryTypes.SELECT }
  );
  if (rows[0]?.patient_id != null) return Number(rows[0].patient_id);
  return n;
}

/** PATIENT.patient_id PK from OP… / numeric route (no fallback to raw n if no row). */
async function resolvePatientPkFromOpRoute(patientIdParam, transaction) {
  const n = Number(String(patientIdParam || '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const qOpts = { replacements: { n }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) };
  const [row] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE patient_id = :n OR user_id = :n LIMIT 1',
    qOpts
  );
  return row?.id != null ? Number(row.id) : null;
}

/**
 * GET /api/doctor/patients/:patientId/regimen/active
 * Open visit (REGIMEN.end IS NULL) for nurse UI sync / status.
 */
exports.getActiveRegimenForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const pid = await resolveCanonicalPatientIdFromEmrParam(req.params.patientId);
    if (!pid) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }
    const emrStrip = Number(String(req.params.patientId || '').replace(/^OP0*/i, ''));
    const apptPatientSql =
      Number.isFinite(emrStrip) && emrStrip > 0
        ? `a.patient_id IN (SELECT p2.patient_id FROM PATIENT p2 WHERE p2.patient_id = :emrStrip OR p2.user_id = :emrStrip)`
        : `a.patient_id = :pid`;

    const [row] = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS startAt
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid }, type: QueryTypes.SELECT }
    );

    /**
     * Room from nurse check-in: prefer APPOINTMENT.regimen_id (set on accept/assign), then date / window
     * around REGIMEN.start (handles timezone vs CURDATE, or legacy rows without regimen_id).
     */
    let checkInRoom = null;
    const regimenId = row ? Number(row.regimenId) : null;
    const regimenStart = row?.startAt != null ? row.startAt : null;

    const roomFromApptRow = (ar) =>
      ar?.roomId != null && Number.isFinite(Number(ar.roomId))
        ? {
            id: Number(ar.roomId),
            name: String(ar.roomName || `Room #${ar.roomId}`).trim() || `Room #${ar.roomId}`,
          }
        : null;

    /** LEFT JOIN: APPOINTMENT.room_id must still resolve if CLINIC_ROOM row is missing (bad FK / seed data). */
    const qApptRoomBase = `
      SELECT a.room_id AS roomId,
             COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
      FROM APPOINTMENT a
      LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
      WHERE (${apptPatientSql})
        AND a.status = 'scheduled'`;

    const apptRepl = (extra = {}) => ({ pid, emrStrip, ...extra });

    if (regimenId) {
      const [linkedAppt] = await sequelize.query(
        `${qApptRoomBase} AND a.regimen_id = :regimenId LIMIT 1`,
        { replacements: apptRepl({ regimenId }), type: QueryTypes.SELECT }
      );
      checkInRoom = roomFromApptRow(linkedAppt);
    }

    /** Same visit: pick scheduled slot whose time is closest to REGIMEN.start (no reliance on CURDATE / regimen_id on row). */
    if (!checkInRoom && row && regimenId) {
      const [closestAppt] = await sequelize.query(
        `SELECT a.room_id AS roomId,
                COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
         FROM APPOINTMENT a
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         INNER JOIN REGIMEN r ON r.patient_id = a.patient_id AND r.id = :regimenId AND r.\`end\` IS NULL
         WHERE (${apptPatientSql})
           AND a.status = 'scheduled'
           AND a.patient_id IS NOT NULL
           AND a.time BETWEEN DATE_SUB(r.\`start\`, INTERVAL 3 DAY) AND DATE_ADD(r.\`start\`, INTERVAL 2 DAY)
         ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, r.\`start\`)) ASC, a.id DESC
         LIMIT 1`,
        { replacements: apptRepl({ regimenId }), type: QueryTypes.SELECT }
      );
      checkInRoom = roomFromApptRow(closestAppt);
    }

    if (!checkInRoom && pid) {
      if (regimenStart) {
        const [byRegimenDate] = await sequelize.query(
          `${qApptRoomBase} AND DATE(a.time) = DATE(:regimenStart)
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byRegimenDate);
      }

      if (!checkInRoom) {
        const [byCurDate] = await sequelize.query(
          `${qApptRoomBase} AND DATE(a.time) = CURDATE()
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl(), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byCurDate);
      }

      if (!checkInRoom && regimenStart) {
        const [byWindow] = await sequelize.query(
          `${qApptRoomBase}
           AND a.time BETWEEN DATE_SUB(:regimenStart, INTERVAL 5 DAY) AND DATE_ADD(:regimenStart, INTERVAL 2 DAY)
           ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, :regimenStart)) ASC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byWindow);
      }

      if (!checkInRoom && regimenStart) {
        const [byTight] = await sequelize.query(
          `${qApptRoomBase}
           AND a.time >= DATE_SUB(:regimenStart, INTERVAL 36 HOUR)
           AND a.time <= DATE_ADD(:regimenStart, INTERVAL 36 HOUR)
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byTight);
      }
    }

    if (!checkInRoom && row) {
      const [trRoom] = await sequelize.query(
        `SELECT t.room_id AS roomId,
                COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', t.room_id)) AS roomName
         FROM TREATMENT t
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         INNER JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :pid AND r.\`end\` IS NULL AND t.room_id IS NOT NULL
         ORDER BY t.time ASC, t.id ASC
         LIMIT 1`,
        { replacements: { pid }, type: QueryTypes.SELECT }
      );
      if (trRoom?.roomId != null) {
        checkInRoom = { id: Number(trRoom.roomId), name: String(trRoom.roomName || '') };
      }
    }

    return res.json({
      success: true,
      active: row
        ? { regimenId: Number(row.regimenId), startAt: row.startAt }
        : null,
      checkInRoom,
    });
  } catch (error) {
    console.error('Get active regimen error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/regimen/close
 * Doctor ends the encounter: set REGIMEN.end = NOW() on the latest open visit.
 * Nhắc uống thuốc do scheduler BE (7:00, 12:00, 18:00) dựa trên đơn còn trong duration.
 */
exports.closeOpenRegimenForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only a doctor can finish the examination' });
    }
    const pid = await resolveCanonicalPatientIdFromEmrParam(req.params.patientId);
    if (!pid) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }
    const [open] = await sequelize.query(
      `SELECT id FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid }, type: QueryTypes.SELECT }
    );
    if (!open) {
      return res.status(404).json({
        success: false,
        message: 'No open visit to close. Check-in may not have been completed for this patient.',
      });
    }
    const regimenId = Number(open.id);
    await sequelize.query(
      `UPDATE REGIMEN SET \`end\` = NOW()
       WHERE id = :regimenId AND patient_id = :pid AND \`end\` IS NULL`,
      { replacements: { regimenId, pid }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, regimenId });
  } catch (error) {
    console.error('Close open regimen error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/health-tracking-slips
 * Persist a "health tracking slip" document into current open regimen.
 */
exports.createHealthTrackingSlipForPatient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a doctor can add this document' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!open) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No active regimen found for this patient' });
    }

    const rawIds = Array.isArray(req.body?.recordIds) ? req.body.recordIds : [];
    const recordIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!recordIds.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'recordIds is required' });
    }

    const mrRows = await sequelize.query(
      `SELECT id, time, \`condition\`, blood_pressure, heart_rate, temperature, weight, respiratory_rate, spo2
       FROM MEDICAL_RECORD
       WHERE patient_id = :patientId AND id IN (:recordIds)
       ORDER BY time ASC`,
      {
        replacements: { patientId: patientPk, recordIds },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    if (!mrRows.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No matching health records found' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(req.user.userId, patientPk, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Health tracking slip',
      department: 'Health info',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create order for health tracking slip' });
    }

    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      ms: req.body?.ms != null ? String(req.body.ms).trim() : '',
      admissionNo: req.body?.admissionNo != null ? String(req.body.admissionNo).trim() : '',
      note: req.body?.note != null ? String(req.body.note).trim() : '',
      recordIds: mrRows.map((r) => Number(r.id)),
      rows: mrRows.map(mapMedicalRecordRowToTrackingRow),
    };

    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: {
          orderId,
          note: JSON.stringify(payload),
          doctorId,
          type: 'HEALTH_TRACKING_SLIP',
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      slip: {
        orderId: Number(orderId),
        regimenId: Number(open.regimenId),
        rowsCount: mrRows.length,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('createHealthTrackingSlipForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/regimen/active/documents
 * Doctor view: aggregate papers/orders in the currently open REGIMEN.
 * Used by Finish examination step 2/2 review.
 */
exports.getActiveRegimenDocumentsForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS regimenStart
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
    );
    if (!open) {
      return res.json({ success: true, regimen: null });
    }
    const regimenId = Number(open.regimenId);

    const [treatments, rxRows, labRows, surgeryRows, hospitalTransferRows, trackingSlipRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.time AS visitAt,
           t.type AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk, regimenId }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS id,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS id,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tr.order_id AS orderId,
           tr.reason,
           tr.time AS transferAt,
           tr.note,
           ht.to_id AS toHospitalId,
           ht.to_name AS toHospitalName,
           ht.transport,
           ht.form_payload AS formPayload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN TRANSFERENCE tr ON tr.order_id = o.id
         INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
         WHERE t.regimen_id = :regimenId
         ORDER BY tr.time ASC`,
        { replacements: { regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.id AS orderId,
           t.time AS createdAt,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             acc.username,
             NULL
           ) AS createdByDoctor,
           p.note AS payload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN PROCEDURE_ p ON p.order_id = o.id
         LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         WHERE t.regimen_id = :regimenId
           AND p.type = 'HEALTH_TRACKING_SLIP'
         ORDER BY t.time ASC, o.id ASC`,
        { replacements: { regimenId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByOrder = new Map();
    for (const row of rxRows || []) {
      if (!rxByOrder.has(row.orderId)) {
        rxByOrder.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        rxByOrder.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const transfers = (hospitalTransferRows || []).map((row) => ({
      orderId: Number(row.orderId),
      reason: row.reason || '',
      note: row.note || '',
      transferAt: row.transferAt,
      toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
      toHospitalName: row.toHospitalName || '',
      transport: row.transport || null,
      formPayload: normalizeJsonColumn(row.formPayload),
    }));

    const healthTrackingSlips = (trackingSlipRows || []).map((row) => {
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      return {
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
          id: Number(r?.id) || 0,
          updatedAt: r?.updatedAt || r?.time || row.createdAt,
          bloodPressure: r?.bloodPressure || '',
          pulse: Number(r?.pulse) || 0,
          temperature: Number(r?.temperature) || 0,
          weight: Number(r?.weight) || 0,
          respiratoryRate: Number(r?.respiratoryRate) || 0,
          spo2: Number(r?.spo2) || 0,
          symptoms: r?.symptoms || '',
        })),
        formPayload: payload,
      };
    });

    return res.json({
      success: true,
      regimen: {
        regimenId,
        regimenStart: open.regimenStart,
        treatments: treatments || [],
        prescriptions: Array.from(rxByOrder.values()),
        labTests: labRows || [],
        surgeries: surgeryRows || [],
        hospitalTransfers: transfers,
        healthTrackingSlips,
      },
    });
  } catch (error) {
    console.error('getActiveRegimenDocumentsForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/medical-regimens
 * Doctor view: completed encounters (REGIMEN with end set) for one patient.
 */
exports.getPatientMedicalRegimensForDoctor = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const regimenRows = await sequelize.query(
      `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
              d.icd_code AS icd10, d.description AS diseaseDescription
       FROM REGIMEN r
       LEFT JOIN DISEASE d ON d.id = r.disease_id
       WHERE r.patient_id = :patientId AND r.end IS NOT NULL
       ORDER BY r.start DESC, r.id DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!regimenRows.length) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
    const idCsv = regimenIds.join(',');

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const hospitalTransferRows = await sequelize.query(
      `SELECT t.regimen_id AS regimenId,
              tr.order_id AS orderId,
              tr.reason,
              tr.time AS transferAt,
              tr.note,
              ht.to_id AS toHospitalId,
              ht.to_name AS toHospitalName,
              ht.transport,
              ht.form_payload AS formPayload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN TRANSFERENCE tr ON tr.order_id = o.id
       INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
       WHERE t.regimen_id IN (${idCsv})
       ORDER BY tr.time ASC`,
      { type: QueryTypes.SELECT }
    );

    const hospitalTransfersByRegimen = new Map();
    for (const row of hospitalTransferRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!hospitalTransfersByRegimen.has(rid)) hospitalTransfersByRegimen.set(rid, []);
      hospitalTransfersByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        reason: row.reason || '',
        note: row.note || '',
        transferAt: row.transferAt,
        toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
        toHospitalName: row.toHospitalName || '',
        transport: row.transport || null,
        formPayload: normalizeJsonColumn(row.formPayload),
      });
    }

    const trackingSlipRows = await sequelize.query(
      `SELECT
         t.regimen_id AS regimenId,
         o.id AS orderId,
         t.time AS createdAt,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           acc.username,
           NULL
         ) AS createdByDoctor,
         p.note AS payload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN PROCEDURE_ p ON p.order_id = o.id
       LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
       LEFT JOIN \`USER\` u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       WHERE t.regimen_id IN (${idCsv})
         AND p.type = 'HEALTH_TRACKING_SLIP'
       ORDER BY t.time ASC, o.id ASC`,
      { type: QueryTypes.SELECT }
    );

    const trackingSlipsByRegimen = new Map();
    for (const row of trackingSlipRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!trackingSlipsByRegimen.has(rid)) trackingSlipsByRegimen.set(rid, []);
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      trackingSlipsByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
          id: Number(r?.id) || 0,
          updatedAt: r?.updatedAt || r?.time || row.createdAt,
          bloodPressure: r?.bloodPressure || '',
          pulse: Number(r?.pulse) || 0,
          temperature: Number(r?.temperature) || 0,
          weight: Number(r?.weight) || 0,
          respiratoryRate: Number(r?.respiratoryRate) || 0,
          spo2: Number(r?.spo2) || 0,
          symptoms: r?.symptoms || '',
        })),
        formPayload: payload,
      });
    }

    const [treatments, rxRows, labRows, surgeryRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.regimen_id AS regimenId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const treatmentsByRegimen = new Map();
    for (const t of treatments || []) {
      const rid = Number(t.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!treatmentsByRegimen.has(rid)) treatmentsByRegimen.set(rid, []);
      treatmentsByRegimen.get(rid).push(t);
    }

    const regimens = (regimenRows || []).map((reg) => {
      const rid = Number(reg.regimenId);
      const tlist = treatmentsByRegimen.get(rid) || [];
      const primary = tlist[0] || null;

      const prescriptionsDedup = new Map();
      for (const tr of tlist) {
        const tid = tr.treatmentId;
        const ordersMap = rxByTreatment.get(tid) || new Map();
        for (const order of ordersMap.values()) {
          if (!prescriptionsDedup.has(order.id)) prescriptionsDedup.set(order.id, order);
        }
      }
      const prescriptionsList = Array.from(prescriptionsDedup.values());

      const labDedup = new Map();
      for (const tr of tlist) {
        for (const lab of labByTreatment.get(tr.treatmentId) || []) {
          labDedup.set(lab.id, lab);
        }
      }
      const labTests = Array.from(labDedup.values());

      const surgeryDedup = new Map();
      for (const tr of tlist) {
        for (const s of surgeryByTreatment.get(tr.treatmentId) || []) {
          surgeryDedup.set(s.id, s);
        }
      }
      const surgeries = Array.from(surgeryDedup.values());

      const complaints = tlist.map((x) => x.complaint).filter((c) => c && String(c).trim());
      const doctors = [...new Set(tlist.map((x) => x.doctorName).filter(Boolean))];

      return {
        regimenId: rid,
        treatmentId: primary ? primary.treatmentId : 0,
        visitAt: reg.regimenStart,
        visitEnd: reg.regimenEnd,
        department: primary?.department || tlist.find((x) => x.department)?.department || '',
        complaint: complaints.length ? complaints.join('\n\n') : '',
        doctorName: doctors.length ? doctors.join(', ') : primary?.doctorName || '',
        roomName: primary?.roomName || '',
        icd10: primary?.icd10 || reg.icd10 || '',
        interpretation: primary?.interpretation || reg.diseaseDescription || '',
        vitals: null,
        prescriptions: prescriptionsList,
        labTests,
        surgeries,
        hospitalTransfers: hospitalTransfersByRegimen.get(rid) || [],
        healthTrackingSlips: trackingSlipsByRegimen.get(rid) || [],
      };
    });

    return res.json({ success: true, regimens });
  } catch (error) {
    console.error('Close open regimen error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/health-tracking-slips
 * Persist a "health tracking slip" document into current open regimen.
 */
exports.createHealthTrackingSlipForPatient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a doctor can add this document' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!open) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No active regimen found for this patient' });
    }

    const rawIds = Array.isArray(req.body?.recordIds) ? req.body.recordIds : [];
    const recordIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!recordIds.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'recordIds is required' });
    }

    const mrRows = await sequelize.query(
      `SELECT id, time, \`condition\`, blood_pressure, heart_rate, temperature, weight, respiratory_rate, spo2
       FROM MEDICAL_RECORD
       WHERE patient_id = :patientId AND id IN (:recordIds)
       ORDER BY time ASC`,
      {
        replacements: { patientId: patientPk, recordIds },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    if (!mrRows.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No matching health records found' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(req.user.userId, patientPk, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Health tracking slip',
      department: 'Health info',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create order for health tracking slip' });
    }

    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      ms: req.body?.ms != null ? String(req.body.ms).trim() : '',
      admissionNo: req.body?.admissionNo != null ? String(req.body.admissionNo).trim() : '',
      note: req.body?.note != null ? String(req.body.note).trim() : '',
      recordIds: mrRows.map((r) => Number(r.id)),
      rows: mrRows.map(mapMedicalRecordRowToTrackingRow),
    };

    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: {
          orderId,
          note: JSON.stringify(payload),
          doctorId,
          type: 'HEALTH_TRACKING_SLIP',
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      slip: {
        orderId: Number(orderId),
        regimenId: Number(open.regimenId),
        rowsCount: mrRows.length,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('createHealthTrackingSlipForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/follow-up-reexam-slip
 * Persist PHIẾU HẸN KHÁM LẠI payload into the current open regimen (PROCEDURE_).
 */
exports.createFollowUpReexamSlipForPatient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a doctor can add this document' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!open) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No active regimen found for this patient' });
    }

    const slip = req.body?.slip;
    if (!slip || typeof slip !== 'object') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip object is required' });
    }
    if (!String(slip.patientName || '').trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip.patientName is required' });
    }

    let noteJson;
    try {
      noteJson = JSON.stringify(slip);
    } catch {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip must be JSON-serializable' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(req.user.userId, patientPk, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Follow-up reexam slip',
      department: 'Outpatient',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create order for follow-up reexam slip' });
    }

    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: {
          orderId,
          note: noteJson,
          doctorId,
          type: 'FOLLOW_UP_REEXAM_SLIP',
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      slip: {
        orderId: Number(orderId),
        regimenId: Number(open.regimenId),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('createFollowUpReexamSlipForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/regimen/active/documents
 * Doctor view: aggregate papers/orders in the currently open REGIMEN.
 * Used by Finish examination step 2/2 review.
 */
exports.getActiveRegimenDocumentsForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS regimenStart
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
    );
    if (!open) {
      return res.json({ success: true, regimen: null });
    }
    const regimenId = Number(open.regimenId);

    const [treatments, rxRows, labRows, surgeryRows, hospitalTransferRows, trackingSlipRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.time AS visitAt,
           t.type AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk, regimenId }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS id,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS id,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tr.order_id AS orderId,
           tr.reason,
           tr.time AS transferAt,
           tr.note,
           ht.to_id AS toHospitalId,
           ht.to_name AS toHospitalName,
           ht.transport,
           ht.form_payload AS formPayload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN TRANSFERENCE tr ON tr.order_id = o.id
         INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
         WHERE t.regimen_id = :regimenId
         ORDER BY tr.time ASC`,
        { replacements: { regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.id AS orderId,
           t.time AS createdAt,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             acc.username,
             NULL
           ) AS createdByDoctor,
           p.note AS payload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN PROCEDURE_ p ON p.order_id = o.id
         LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         WHERE t.regimen_id = :regimenId
           AND p.type = 'HEALTH_TRACKING_SLIP'
         ORDER BY t.time ASC, o.id ASC`,
        { replacements: { regimenId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByOrder = new Map();
    for (const row of rxRows || []) {
      if (!rxByOrder.has(row.orderId)) {
        rxByOrder.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        rxByOrder.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const transfers = (hospitalTransferRows || []).map((row) => ({
      orderId: Number(row.orderId),
      reason: row.reason || '',
      note: row.note || '',
      transferAt: row.transferAt,
      toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
      toHospitalName: row.toHospitalName || '',
      transport: row.transport || null,
      formPayload: normalizeJsonColumn(row.formPayload),
    }));

    const healthTrackingSlips = (trackingSlipRows || []).map((row) => {
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      return {
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
          id: Number(r?.id) || 0,
          updatedAt: r?.updatedAt || r?.time || row.createdAt,
          bloodPressure: r?.bloodPressure || '',
          pulse: Number(r?.pulse) || 0,
          temperature: Number(r?.temperature) || 0,
          weight: Number(r?.weight) || 0,
          respiratoryRate: Number(r?.respiratoryRate) || 0,
          spo2: Number(r?.spo2) || 0,
          symptoms: r?.symptoms || '',
        })),
        formPayload: payload,
      };
    });

    return res.json({
      success: true,
      regimen: {
        regimenId,
        regimenStart: open.regimenStart,
        treatments: treatments || [],
        prescriptions: Array.from(rxByOrder.values()),
        labTests: labRows || [],
        surgeries: surgeryRows || [],
        hospitalTransfers: transfers,
        healthTrackingSlips,
      },
    });
  } catch (error) {
    console.error('getActiveRegimenDocumentsForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/medical-regimens
 * Doctor view: completed encounters (REGIMEN with end set) for one patient.
 */
exports.getPatientMedicalRegimensForDoctor = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const regimenRows = await sequelize.query(
      `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
              d.icd_code AS icd10, d.description AS diseaseDescription
       FROM REGIMEN r
       LEFT JOIN DISEASE d ON d.id = r.disease_id
       WHERE r.patient_id = :patientId AND r.end IS NOT NULL
       ORDER BY r.start DESC, r.id DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!regimenRows.length) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
    const idCsv = regimenIds.join(',');

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const hospitalTransferRows = await sequelize.query(
      `SELECT t.regimen_id AS regimenId,
              tr.order_id AS orderId,
              tr.reason,
              tr.time AS transferAt,
              tr.note,
              ht.to_id AS toHospitalId,
              ht.to_name AS toHospitalName,
              ht.transport,
              ht.form_payload AS formPayload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN TRANSFERENCE tr ON tr.order_id = o.id
       INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
       WHERE t.regimen_id IN (${idCsv})
       ORDER BY tr.time ASC`,
      { type: QueryTypes.SELECT }
    );

    const hospitalTransfersByRegimen = new Map();
    for (const row of hospitalTransferRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!hospitalTransfersByRegimen.has(rid)) hospitalTransfersByRegimen.set(rid, []);
      hospitalTransfersByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        reason: row.reason || '',
        note: row.note || '',
        transferAt: row.transferAt,
        toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
        toHospitalName: row.toHospitalName || '',
        transport: row.transport || null,
        formPayload: normalizeJsonColumn(row.formPayload),
      });
    }

    const trackingSlipRows = await sequelize.query(
      `SELECT
         t.regimen_id AS regimenId,
         o.id AS orderId,
         t.time AS createdAt,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           acc.username,
           NULL
         ) AS createdByDoctor,
         p.note AS payload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN PROCEDURE_ p ON p.order_id = o.id
       LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
       LEFT JOIN \`USER\` u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       WHERE t.regimen_id IN (${idCsv})
         AND p.type = 'HEALTH_TRACKING_SLIP'
       ORDER BY t.time ASC, o.id ASC`,
      { type: QueryTypes.SELECT }
    );

    const trackingSlipsByRegimen = new Map();
    for (const row of trackingSlipRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!trackingSlipsByRegimen.has(rid)) trackingSlipsByRegimen.set(rid, []);
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      trackingSlipsByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
          id: Number(r?.id) || 0,
          updatedAt: r?.updatedAt || r?.time || row.createdAt,
          bloodPressure: r?.bloodPressure || '',
          pulse: Number(r?.pulse) || 0,
          temperature: Number(r?.temperature) || 0,
          weight: Number(r?.weight) || 0,
          respiratoryRate: Number(r?.respiratoryRate) || 0,
          spo2: Number(r?.spo2) || 0,
          symptoms: r?.symptoms || '',
        })),
        formPayload: payload,
      });
    }

    const followUpReexamRows = await sequelize.query(
      `SELECT
         t.regimen_id AS regimenId,
         o.id AS orderId,
         t.time AS createdAt,
         p.note AS payload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN PROCEDURE_ p ON p.order_id = o.id
       WHERE t.regimen_id IN (${idCsv})
         AND p.type = 'FOLLOW_UP_REEXAM_SLIP'
       ORDER BY t.time ASC, o.id ASC`,
      { type: QueryTypes.SELECT }
    );

    const followUpReexamSlipsByRegimen = new Map();
    for (const row of followUpReexamRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      const slip = normalizeJsonColumn(row.payload);
      if (!slip || typeof slip !== 'object') continue;
      if (!followUpReexamSlipsByRegimen.has(rid)) followUpReexamSlipsByRegimen.set(rid, []);
      followUpReexamSlipsByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        slip,
      });
    }

    const [treatments, rxRows, labRows, surgeryRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.regimen_id AS regimenId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const treatmentsByRegimen = new Map();
    for (const t of treatments || []) {
      const rid = Number(t.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!treatmentsByRegimen.has(rid)) treatmentsByRegimen.set(rid, []);
      treatmentsByRegimen.get(rid).push(t);
    }

    const regimens = (regimenRows || []).map((reg) => {
      const rid = Number(reg.regimenId);
      const tlist = treatmentsByRegimen.get(rid) || [];
      const primary = tlist[0] || null;

      const prescriptionsDedup = new Map();
      for (const tr of tlist) {
        const tid = tr.treatmentId;
        const ordersMap = rxByTreatment.get(tid) || new Map();
        for (const order of ordersMap.values()) {
          if (!prescriptionsDedup.has(order.id)) prescriptionsDedup.set(order.id, order);
        }
      }
      const prescriptionsList = Array.from(prescriptionsDedup.values());

      const labDedup = new Map();
      for (const tr of tlist) {
        for (const lab of labByTreatment.get(tr.treatmentId) || []) {
          labDedup.set(lab.id, lab);
        }
      }
      const labTests = Array.from(labDedup.values());

      const surgeryDedup = new Map();
      for (const tr of tlist) {
        for (const s of surgeryByTreatment.get(tr.treatmentId) || []) {
          surgeryDedup.set(s.id, s);
        }
      }
      const surgeries = Array.from(surgeryDedup.values());

      const complaints = tlist.map((x) => x.complaint).filter((c) => c && String(c).trim());
      const doctors = [...new Set(tlist.map((x) => x.doctorName).filter(Boolean))];

      return {
        regimenId: rid,
        treatmentId: primary ? primary.treatmentId : 0,
        visitAt: reg.regimenStart,
        visitEnd: reg.regimenEnd,
        department: primary?.department || tlist.find((x) => x.department)?.department || '',
        complaint: complaints.length ? complaints.join('\n\n') : '',
        doctorName: doctors.length ? doctors.join(', ') : primary?.doctorName || '',
        roomName: primary?.roomName || '',
        icd10: primary?.icd10 || reg.icd10 || '',
        interpretation: primary?.interpretation || reg.diseaseDescription || '',
        vitals: null,
        prescriptions: prescriptionsList,
        labTests,
        surgeries,
        hospitalTransfers: hospitalTransfersByRegimen.get(rid) || [],
        healthTrackingSlips: trackingSlipsByRegimen.get(rid) || [],
        followUpReexamSlips: followUpReexamSlipsByRegimen.get(rid) || [],
      };
    });

    return res.json({ success: true, regimens });
  } catch (error) {
    console.error('getPatientMedicalRegimensForDoctor error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/regimen/active/documents
 * Doctor view: aggregate papers/orders in the currently open REGIMEN.
 * Used by Finish examination step 2/2 review.
 */
exports.getActiveRegimenDocumentsForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS regimenStart
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
    );
    if (!open) {
      return res.json({ success: true, regimen: null });
    }
    const regimenId = Number(open.regimenId);

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const [treatments, rxRows, labRows, surgeryRows, hospitalTransferRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk, regimenId }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS id,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS id,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id = :regimenId
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk, regimenId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tr.order_id AS orderId,
           tr.reason,
           tr.time AS transferAt,
           tr.note,
           ht.to_id AS toHospitalId,
           ht.to_name AS toHospitalName,
           ht.transport,
           ht.form_payload AS formPayload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN TRANSFERENCE tr ON tr.order_id = o.id
         INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
         WHERE t.regimen_id = :regimenId
         ORDER BY tr.time ASC`,
        { replacements: { regimenId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByOrder = new Map();
    for (const row of rxRows || []) {
      if (!rxByOrder.has(row.orderId)) {
        rxByOrder.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        rxByOrder.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const transfers = (hospitalTransferRows || []).map((row) => ({
      orderId: Number(row.orderId),
      reason: row.reason || '',
      note: row.note || '',
      transferAt: row.transferAt,
      toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
      toHospitalName: row.toHospitalName || '',
      transport: row.transport || null,
      formPayload: normalizeJsonColumn(row.formPayload),
    }));

    return res.json({
      success: true,
      regimen: {
        regimenId,
        regimenStart: open.regimenStart,
        treatments: treatments || [],
        prescriptions: Array.from(rxByOrder.values()),
        labTests: labRows || [],
        surgeries: surgeryRows || [],
        hospitalTransfers: transfers,
      },
    });
  } catch (error) {
    console.error('getActiveRegimenDocumentsForPatient error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/medical-regimens
 * Doctor view: completed encounters (REGIMEN with end set) for one patient.
 */
exports.getPatientMedicalRegimensForDoctor = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const regimenRows = await sequelize.query(
      `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
              d.icd_code AS icd10, d.description AS diseaseDescription
       FROM REGIMEN r
       LEFT JOIN DISEASE d ON d.id = r.disease_id
       WHERE r.patient_id = :patientId AND r.end IS NOT NULL
       ORDER BY r.start DESC, r.id DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!regimenRows.length) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
    const idCsv = regimenIds.join(',');

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const hospitalTransferRows = await sequelize.query(
      `SELECT t.regimen_id AS regimenId,
              tr.order_id AS orderId,
              tr.reason,
              tr.time AS transferAt,
              tr.note,
              ht.to_id AS toHospitalId,
              ht.to_name AS toHospitalName,
              ht.transport,
              ht.form_payload AS formPayload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN TRANSFERENCE tr ON tr.order_id = o.id
       INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
       WHERE t.regimen_id IN (${idCsv})
       ORDER BY tr.time ASC`,
      { type: QueryTypes.SELECT }
    );

    const hospitalTransfersByRegimen = new Map();
    for (const row of hospitalTransferRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!hospitalTransfersByRegimen.has(rid)) hospitalTransfersByRegimen.set(rid, []);
      hospitalTransfersByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        reason: row.reason || '',
        note: row.note || '',
        transferAt: row.transferAt,
        toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
        toHospitalName: row.toHospitalName || '',
        transport: row.transport || null,
        formPayload: normalizeJsonColumn(row.formPayload),
      });
    }

    const [treatments, rxRows, labRows, surgeryRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.regimen_id AS regimenId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const treatmentsByRegimen = new Map();
    for (const t of treatments || []) {
      const rid = Number(t.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!treatmentsByRegimen.has(rid)) treatmentsByRegimen.set(rid, []);
      treatmentsByRegimen.get(rid).push(t);
    }

    const regimens = (regimenRows || []).map((reg) => {
      const rid = Number(reg.regimenId);
      const tlist = treatmentsByRegimen.get(rid) || [];
      const primary = tlist[0] || null;

      const prescriptionsDedup = new Map();
      for (const tr of tlist) {
        const tid = tr.treatmentId;
        const ordersMap = rxByTreatment.get(tid) || new Map();
        for (const order of ordersMap.values()) {
          if (!prescriptionsDedup.has(order.id)) prescriptionsDedup.set(order.id, order);
        }
      }
      const prescriptionsList = Array.from(prescriptionsDedup.values());

      const labDedup = new Map();
      for (const tr of tlist) {
        for (const lab of labByTreatment.get(tr.treatmentId) || []) {
          labDedup.set(lab.id, lab);
        }
      }
      const labTests = Array.from(labDedup.values());

      const surgeryDedup = new Map();
      for (const tr of tlist) {
        for (const s of surgeryByTreatment.get(tr.treatmentId) || []) {
          surgeryDedup.set(s.id, s);
        }
      }
      const surgeries = Array.from(surgeryDedup.values());

      const complaints = tlist.map((x) => x.complaint).filter((c) => c && String(c).trim());
      const doctors = [...new Set(tlist.map((x) => x.doctorName).filter(Boolean))];

      return {
        regimenId: rid,
        treatmentId: primary ? primary.treatmentId : 0,
        visitAt: reg.regimenStart,
        visitEnd: reg.regimenEnd,
        department: primary?.department || tlist.find((x) => x.department)?.department || '',
        complaint: complaints.length ? complaints.join('\n\n') : '',
        doctorName: doctors.length ? doctors.join(', ') : primary?.doctorName || '',
        roomName: primary?.roomName || '',
        icd10: primary?.icd10 || reg.icd10 || '',
        interpretation: primary?.interpretation || reg.diseaseDescription || '',
        vitals: null,
        prescriptions: prescriptionsList,
        labTests,
        surgeries,
        hospitalTransfers: hospitalTransfersByRegimen.get(rid) || [],
      };
    });

    return res.json({ success: true, regimens });
  } catch (error) {
    console.error('getPatientMedicalRegimensForDoctor error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  HEALTH INFO
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/patients/:patientId/health-info
 * Get latest health info for a patient
 */
exports.getHealthInfo = async (req, res) => {
  try {
    const { patientId } = req.params;
    const pid = await resolveCanonicalPatientIdFromEmrParam(patientId);
    if (!pid) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const healthInfo = await HealthInfo.findOne({
      where: { patient_id: pid },
      order: [['time', 'DESC']]
    });

    const patient = await Patient.findByPk(pid);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const parseJSON = (val) => {
      try {
        return typeof val === "string"
          ? JSON.parse(val)
          : val || {}
      } catch (e) {
        console.error("Parse error:", e, val)
        return {}
      }
    }

    res.json({
      success: true,
      healthInfo: healthInfo?.toJSON() || null,
      patientInfo: {
        blood_type: patient.blood_type,
        allergic_info: parseJSON(patient.allergic_info),
        medical_history: parseJSON(patient.medical_history)
      }
    });
  } catch (error) {
    console.error('Get health info error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/health-info/history
 * Get health info history for a patient
 */
exports.getHealthInfoHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    const pid = await resolveCanonicalPatientIdFromEmrParam(patientId);
    if (!pid) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: history } = await HealthInfo.findAndCountAll({
      where: { patient_id: pid },
      order: [['time', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      history,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get health info history error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/health-info
 * Create a new health info record (snapshot)
 */
exports.createHealthInfo = async (req, res) => {
  try {
    const { patientId } = req.params;

    const pid = await resolveCanonicalPatientIdFromEmrParam(patientId);
    const patientRow = pid ? await Patient.findByPk(pid) : null;
    if (!patientRow) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    let mrPayload;
    try {
      mrPayload = coerceMedicalRecordCreatePayload(req.body);
    } catch (e) {
      if (e.statusCode === 400) {
        return res.status(400).json({ success: false, message: e.message });
      }
      throw e;
    }

    const healthInfo = await HealthInfo.create({
      patient_id: pid,
      ...mrPayload,
    });

    res.status(201).json({ success: true, healthInfo });
  } catch (error) {
    console.error('Create health info error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/patients/:patientId/health-info/:id
 * Update a health info record
 */
exports.updateHealthInfo = async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const pid = await resolveCanonicalPatientIdFromEmrParam(patientId);
    if (!pid) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const healthInfo = await HealthInfo.findOne({
      where: { id, patient_id: pid }
    });

    if (!healthInfo) {
      return res.status(404).json({ success: false, message: 'Health info record not found' });
    }

    if (normalizeMedicalRecordStatus(healthInfo.status) !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft records can be edited' });
    }

    const updates = coerceMedicalRecordUpdatePayload(req.body);
    if (Object.keys(updates).length > 0) {
      await healthInfo.update(updates);
    }

    res.json({ success: true, healthInfo });
  } catch (error) {
    console.error('Update health info error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * DELETE /api/doctor/patients/:patientId/health-info/:id
 * Delete a health info record
 */
exports.deleteHealthInfo = async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const pid = await resolveCanonicalPatientIdFromEmrParam(patientId);
    if (!pid) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const healthInfo = await HealthInfo.findOne({
      where: { id, patient_id: pid }
    });

    if (!healthInfo) {
      return res.status(404).json({ success: false, message: 'Health info record not found' });
    }

    await healthInfo.destroy();

    res.json({ success: true, message: 'Health info record deleted' });
  } catch (error) {
    console.error('Delete health info error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.confirmHealthInfo = async (req, res) => {
  try {
    const pid = await resolveCanonicalPatientIdFromEmrParam(req.params.patientId);
    if (!pid) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    const id = Number(req.params.id);
    const healthInfo = await HealthInfo.findOne({
      where: { id, patient_id: pid }
    });
    if (!healthInfo) {
      return res.status(404).json({ success: false, message: 'Health info record not found' });
    }
    if (normalizeMedicalRecordStatus(healthInfo.status) !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft records can be confirmed' });
    }
    await healthInfo.update({ status: 'confirmed', time: new Date() });
    return res.json({ success: true, id: healthInfo.id, status: 'confirmed' });
  } catch (error) {
    console.error('Confirm health info error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  DIAGNOSES
// ═══════════════════════════════════════════════

exports.getDiseaseCodes = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await sequelize.query(
      `SELECT
         icd_code AS code,
         description
       FROM DISEASE
       WHERE (:q = '' OR icd_code LIKE :likeQ OR description LIKE :likeQ)
       ORDER BY icd_code ASC
       LIMIT 300`,
      {
        replacements: { q, likeQ: `%${q}%` },
        type: QueryTypes.SELECT
      }
    );
    res.json({ success: true, diseases: rows });
  } catch (error) {
    console.error('Get disease codes error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/medicines?q=
 * List medicine names from MEDICINE (for prescription combobox).
 */
exports.getMedicines = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await sequelize.query(
      `SELECT id, name, unit
       FROM MEDICINE
       WHERE (:q = '' OR name LIKE :likeQ)
       ORDER BY name ASC
       LIMIT 300`,
      {
        replacements: { q, likeQ: `%${q}%` },
        type: QueryTypes.SELECT
      }
    );
    res.json({ success: true, medicines: rows });
  } catch (error) {
    console.error('Get medicines error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/technicians
 * List all technicians in the system (for technician combobox).
 */
exports.getTechnicians = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         te.technician_id AS technicianId,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           a.username
         ) AS technicianName
       FROM TECHNICIAN te
       JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       ORDER BY technicianName ASC
       LIMIT 1000`,
      { type: QueryTypes.SELECT }
    );

    res.json({ success: true, technicians: rows });
  } catch (error) {
    console.error('Get technicians error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/departments
 * Master list of DEPARTMENT for combobox usage.
 */
exports.getDepartments = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name
       FROM DEPARTMENT
       ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    const departments = rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim(),
    }));
    res.json({ success: true, departments });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/diagnoses
 * Get all diagnoses for a patient
 */
exports.getDiagnoses = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const diagnoses = await sequelize.query(
      `SELECT
         t.id,
         r.patient_id AS patientId,
         d.user_id AS doctorId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         t.type AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         '' AS note,
         t.time AS createdAt,
         t.time AS updatedAt
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DISEASE dis ON dis.id = COALESCE(t.disease_id, r.disease_id)
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE r.patient_id = :patientId
       ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
       ORDER BY t.time DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, diagnoses });
  } catch (error) {
    console.error('Get diagnoses error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/diagnoses
 * Create a new diagnosis
 */
exports.createDiagnosis = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      doctorUser.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease(icd10, interpretation, transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint,
      department,
      diseaseId,
      transaction
    });
    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      complaint,
      icd10,
      interpretation: interpretation || '',
      note: note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await transaction.commit();

    res.status(201).json({ success: true, diagnosis });
  } catch (error) {
    await transaction.rollback();
    console.error('Create diagnosis error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/patients/:patientId/diagnoses/:id
 * Update an existing diagnosis (TREATMENT row for this patient).
 */
exports.updateDiagnosis = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    const treatmentId = Number(req.params.id);
    if (!patientPk || !Number.isFinite(treatmentId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or diagnosis id' });
    }

    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    const row = await sequelize.query(
      `SELECT t.id, t.regimen_id, r.patient_id,
              COALESCE(t.disease_id, r.disease_id) AS effective_disease_id
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE t.id = :treatmentId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { treatmentId, patientId: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!row[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Diagnosis not found' });
    }

    const { regimen_id: regimenId, effective_disease_id: oldEffective } = row[0];
    const newDiseaseId = await ensureDisease(icd10, interpretation, transaction);
    const oldEff = oldEffective != null ? Number(oldEffective) : NaN;
    const newEff = Number(newDiseaseId);

    const [regRow] = await sequelize.query(
      `SELECT \`end\` AS ended FROM REGIMEN WHERE id = :id LIMIT 1`,
      { replacements: { id: regimenId }, type: QueryTypes.SELECT, transaction }
    );
    const regOpen = regRow && (regRow.ended == null || regRow.ended === '');

    if (Number.isFinite(oldEff) && oldEff !== newEff && !regOpen) {
      const newRegimenId = await ensureRegimen(patientPk, newDiseaseId, transaction);
      await sequelize.query(
        `UPDATE TREATMENT
         SET regimen_id = :newRegimenId,
             \`condition\` = :complaint,
             type = :type,
             disease_id = :diseaseId
         WHERE id = :treatmentId`,
        {
          replacements: {
            newRegimenId,
            complaint: complaint.trim(),
            type: department || 'General',
            diseaseId: newDiseaseId,
            treatmentId,
          },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    } else {
      await sequelize.query(
        `UPDATE TREATMENT
         SET \`condition\` = :complaint,
             type = :type,
             disease_id = :diseaseId
         WHERE id = :treatmentId`,
        {
          replacements: {
            complaint: complaint.trim(),
            type: department || 'General',
            diseaseId: newDiseaseId,
            treatmentId,
          },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }
    if (interpretation != null && String(interpretation).trim() !== '') {
      await sequelize.query(
        'UPDATE DISEASE SET description = :description WHERE id = :diseaseId',
        {
          replacements: { description: String(interpretation).trim(), diseaseId: newDiseaseId },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }

    await transaction.commit();

    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      complaint: complaint.trim(),
      icd10: icd10.trim(),
      interpretation: interpretation || '',
      note: note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({ success: true, diagnosis });
  } catch (error) {
    await transaction.rollback();
    console.error('Update diagnosis error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  PRESCRIPTIONS
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/patients/:patientId/prescriptions
 * Get all prescriptions for a patient
 */
exports.getPrescriptions = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const sqlWithDuration = `SELECT
         rx.order_id,
         rx.time,
         COALESCE(rx.duration, 7) AS prescriptionDuration,
         d.user_id AS doctorUserId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         COALESCE(pd.duration, 7) AS lineDuration,
         pd.usage,
         pd.unit,
         pd.note
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`;

    const sqlLegacy = `SELECT
         rx.order_id,
         rx.time,
         d.user_id AS doctorUserId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.usage,
         pd.unit,
         pd.note
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`;

    const rows = await selectPrescriptionRowsWithDurationFallback(
      sequelize,
      sqlWithDuration,
      sqlLegacy,
      { patientId: patientPk }
    );

    const map = new Map();
    for (const row of rows) {
      const key = row.order_id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          patientId: patientPk,
          doctorId: row.doctorUserId || req.user.userId,
          doctorName: row.doctorName || '',
          department: 'General',
          duration: Number(row.prescriptionDuration) || 7,
          /** No MEDICAL_PRESCRIPTION.status column — saved Rx is final (UI treats as signed). */
          signatureStatus: 'signed',
          medications: [],
          createdAt: row.time,
          updatedAt: row.time
        });
      }
      if (row.name) {
        map.get(key).medications.push({
          id: `${key}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
          usage: row.usage || '',
          unit: row.unit || 'tablet',
          note: row.note || ''
        });
      }
    }
    const prescriptions = Array.from(map.values());

    res.json({ success: true, prescriptions });
  } catch (error) {
    console.error('Get prescriptions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/patients/:patientId/prescriptions
 * Create a new prescription with medications
 */
exports.createPrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { department, medications, duration: bodyRxDuration } = req.body;
    const headerDuration = normalizeMedicalPrescriptionDuration(bodyRxDuration);

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      doctorUser.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Prescription',
      department,
      diseaseId,
      transaction
    });
    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create prescription order' });
    }
    await insertMedicalPrescriptionCompat(sequelize, {
      orderId,
      duration: headerDuration,
      note: department || '',
      transaction,
    });

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim().slice(0, 200);
      if (!medName) continue;
      const lineDur = normalizePrescriptionLineDuration(med.duration);
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id != null ? Number(found[0].id) : null;
      if (!medicineId) {
        const [insMed] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = mysqlInsertId(insMed);
      }
      if (!medicineId) {
        await transaction.rollback();
        return res.status(500).json({ success: false, message: 'Failed to resolve medicine id' });
      }
      const unitNorm = normalizePrescriptionDetailUnit(med.unit);
      const usageNorm = clampPrescriptionUsage(med.usage);
      const noteNorm = clampPrescriptionNote(med.note);
      await insertPrescriptionDetailCompat(sequelize, {
        prescriptionId: orderId,
        no,
        medicineId,
        quantity: Number(med.quantity) || 1,
        duration: lineDur,
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm,
        transaction,
      });
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        duration: String(lineDur),
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm || ''
      });
      no += 1;
    }

    if (meds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication with a name is required' });
    }

    const doctorName = await resolveDoctorDisplayName(req);
    const timeRows = await sequelize.query(
      'SELECT time FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1',
      { replacements: { orderId }, type: QueryTypes.SELECT, transaction }
    );
    const rxTime = timeRows[0]?.time;
    const createdAt = rxTime ? new Date(rxTime).toISOString() : new Date().toISOString();
    const prescription = {
      id: orderId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      duration: headerDuration,
      signatureStatus: 'signed',
      medications: meds,
      createdAt,
      updatedAt: createdAt
    };
    await transaction.commit();

    res.status(201).json({ success: true, prescription });
  } catch (error) {
    await transaction.rollback();
    console.error('Create prescription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/patients/:patientId/prescriptions/:id
 * Replace line items of an existing prescription (same ORDER / MEDICAL_PRESCRIPTION).
 */
exports.updatePrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    const orderId = Number(req.params.id);
    if (!patientPk || !Number.isFinite(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or prescription id' });
    }

    const { department, medications, duration: bodyRxDuration } = req.body;
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    const headerDurationUpd =
      bodyRxDuration !== undefined && bodyRxDuration !== null
        ? normalizeMedicalPrescriptionDuration(bodyRxDuration)
        : null;

    const exists = await sequelize.query(
      `SELECT rx.order_id
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { orderId, patientId: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!exists[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    await sequelize.query('DELETE FROM PRESCRIPTION_DETAIL WHERE prescription_id = :orderId', {
      replacements: { orderId },
      type: QueryTypes.DELETE,
      transaction
    });

    await updateMedicalPrescriptionCompat(sequelize, {
      orderId,
      transaction,
      setNote: department !== undefined ? department || '' : undefined,
      setDuration: headerDurationUpd != null ? headerDurationUpd : undefined,
    });

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim().slice(0, 200);
      if (!medName) continue;
      const lineDur = normalizePrescriptionLineDuration(med.duration);
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id != null ? Number(found[0].id) : null;
      if (!medicineId) {
        const [insMed] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = mysqlInsertId(insMed);
      }
      if (!medicineId) {
        await transaction.rollback();
        return res.status(500).json({ success: false, message: 'Failed to resolve medicine id' });
      }
      const unitNorm = normalizePrescriptionDetailUnit(med.unit);
      const usageNorm = clampPrescriptionUsage(med.usage);
      const noteNorm = clampPrescriptionNote(med.note);
      await insertPrescriptionDetailCompat(sequelize, {
        prescriptionId: orderId,
        no,
        medicineId,
        quantity: Number(med.quantity) || 1,
        duration: lineDur,
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm,
        transaction,
      });
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        duration: String(lineDur),
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm || ''
      });
      no += 1;
    }

    if (meds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication with a name is required' });
    }

    const doctorName = await resolveDoctorDisplayName(req);
    const metaRows = await selectMedicalPrescriptionMetaCompat(sequelize, { orderId, transaction });
    const rxTime = metaRows[0]?.time;
    const updatedAt = rxTime ? new Date(rxTime).toISOString() : new Date().toISOString();
    const prescription = {
      id: orderId,
      patientId: patientPk,
      doctorId: req.user.userId,
      doctorName,
      department: department || '',
      duration: Number(metaRows[0]?.duration) || headerDurationUpd || 7,
      signatureStatus: 'signed',
      medications: meds,
      createdAt: updatedAt,
      updatedAt
    };

    await transaction.commit();

    res.json({ success: true, prescription });
  } catch (error) {
    await transaction.rollback();
    console.error('Update prescription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  LAB TESTS
// ═══════════════════════════════════════════════

exports.getLabTests = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const rows = await sequelize.query(
      `SELECT
         tst.id,
         r.patient_id AS patientId,
         COALESCE(tst.technician_id, p.technician_id) AS technicianId,
         tst.type AS testType,
         tst.time AS testDate,
         COALESCE(td.result, tst.result) AS resultSummary,
         COALESCE(tst.note, p.note) AS note,
         tst.attachment_url AS fileUrl,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           a.username
         ) AS technicianName
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
       LEFT JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       LEFT JOIN TEST_DETAIL td ON td.test_id = tst.id AND td.no = 1
       WHERE r.patient_id = :patientId
       ORDER BY tst.time DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, labTests: rows });
  } catch (error) {
    console.error('Get lab tests error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createLabTest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = req.body;
    if (!testType || !testDate) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'testType and testDate are required' });
    }
    const testDateSql = normalizeDateTimeForDb(testDate);
    if (!testDateSql) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid testDate format' });
    }

    let technicianIdResolved = null;
    if (technicianId !== undefined && technicianId !== null) {
      const n = Number(technicianId);
      technicianIdResolved = Number.isFinite(n) ? n : null;
    }
    if (!technicianIdResolved && req.user?.role === 'technician') {
      technicianIdResolved = await getTechnicianIdByUserId(req.user.userId, transaction);
    }

    let doctorId = await getDoctorIdForUserOrLatestForPatient(
      req.user.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Laboratory test',
      department: 'Lab',
      diseaseId,
      transaction
    });
    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      { replacements: { status: 'active', treatmentId }, type: QueryTypes.INSERT, transaction }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create lab order' });
    }
    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, :technicianId, :doctorId, NULL, 'TEST')`,
      {
        replacements: { orderId, note: note || null, technicianId: technicianIdResolved, doctorId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    await sequelize.query(
      'INSERT INTO TEST (id, time, type, technician_id, result, note, attachment_url) VALUES (:id, :time, :type, :technicianId, :result, :note, :attachment_url)',
      {
        replacements: {
          id: orderId,
          time: testDateSql,
          type: testType,
          technicianId: technicianIdResolved,
          result: resultSummary ?? null,
          note: note ?? null,
          attachment_url: fileUrl ?? null,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    await sequelize.query(
      'INSERT INTO TEST_DETAIL (test_id, no, `index`, result) VALUES (:testId, 1, :idx, :result)',
      {
        replacements: { testId: orderId, idx: 'summary', result: resultSummary || '' },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const labTest = {
      id: orderId,
      patientId: patientPk,
      testType,
      testDate,
      technicianId: technicianIdResolved,
      technicianName: technicianName || null,
      resultSummary: resultSummary || null,
      fileUrl: fileUrl || null,
      note: note || null,
    };
    await transaction.commit();
    res.status(201).json({ success: true, labTest });
  } catch (error) {
    await transaction.rollback();
    console.error('Create lab test error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.updateLabTest = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { id } = req.params;
    const exists = await sequelize.query(
      `SELECT tst.id
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE tst.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }
    const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = req.body;

    let testDateSql;
    if (testDate !== undefined) {
      testDateSql = normalizeDateTimeForDb(testDate);
      if (!testDateSql) {
        return res.status(400).json({ success: false, message: 'Invalid testDate format' });
      }
    }

    let technicianIdResolved;
    const technicianIdWasProvided = technicianId !== undefined;
    if (technicianIdWasProvided) {
      if (technicianId === null) technicianIdResolved = null;
      else {
        const n = Number(technicianId);
        technicianIdResolved = Number.isFinite(n) ? n : null;
      }
    } else if (req.user?.role === 'technician') {
      technicianIdResolved = await getTechnicianIdByUserId(req.user.userId, null);
    }

    // Update technician mapping (supports technician role + manual selection).
    if (technicianIdWasProvided || req.user?.role === 'technician') {
      await sequelize.query(
        'UPDATE TEST SET technician_id = :technicianId WHERE id = :id',
        { replacements: { id, technicianId: technicianIdResolved ?? null }, type: QueryTypes.UPDATE }
      );
      await sequelize.query(
        'UPDATE PROCEDURE_ SET technician_id = :technicianId WHERE order_id = :id',
        { replacements: { id, technicianId: technicianIdResolved ?? null }, type: QueryTypes.UPDATE }
      );
    }

    if (testType !== undefined || testDate !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET type = COALESCE(:type, type), time = COALESCE(:time, time) WHERE id = :id',
        { replacements: { id, type: testType || null, time: testDateSql || null }, type: QueryTypes.UPDATE }
      );
    }
    if (note !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET note = :note WHERE id = :id',
        { replacements: { id, note }, type: QueryTypes.UPDATE }
      );
      // Backward compatibility: some older rows might still store value in PROCEDURE_.note
      await sequelize.query(
        'UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id',
        { replacements: { id, note }, type: QueryTypes.UPDATE }
      );
    }
    if (fileUrl !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET attachment_url = :fileUrl WHERE id = :id',
        { replacements: { id, fileUrl }, type: QueryTypes.UPDATE }
      );
    }
    if (resultSummary !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET result = :result WHERE id = :id',
        { replacements: { id, result: resultSummary ?? null }, type: QueryTypes.UPDATE }
      );
      await sequelize.query(
        `INSERT INTO TEST_DETAIL (test_id, no, \`index\`, result)
         VALUES (:id, 1, 'summary', :result)
         ON DUPLICATE KEY UPDATE result = VALUES(result)`,
        { replacements: { id, result: resultSummary || '' }, type: QueryTypes.INSERT }
      );
    }
    res.json({ success: true, labTest: { id: Number(id), testType, testDate, technicianName, resultSummary, fileUrl, note } });
  } catch (error) {
    console.error('Update lab test error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getLabTestDetails = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }

    const testId = Number(req.params.id);
    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid test id' });
    }

    const exists = await sequelize.query(
      `SELECT tst.id
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE tst.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id: testId, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }

    const details = await sequelize.query(
      `SELECT
         test_id AS testId,
         no,
         \`index\` AS itemIndex,
         result,
         numeric_value AS numericValue,
         unit
       FROM TEST_DETAIL
       WHERE test_id = :testId
       ORDER BY no ASC`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, details });
  } catch (error) {
    console.error('Get lab test details error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.uploadLabAttachment = async (req, res) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body || {};
    if (!fileName || !mimeType || !dataBase64) {
      return res.status(400).json({ success: false, message: 'fileName, mimeType, dataBase64 are required' });
    }

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(String(mimeType).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Unsupported file type. Only PDF and images are allowed.' });
    }

    const cleanName = String(fileName)
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'lab-file';

    const ext = path.extname(cleanName) || (String(mimeType).includes('pdf') ? '.pdf' : '.png');
    const outName = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'lab');
    ensureDir(uploadsDir);
    const outPath = path.join(uploadsDir, outName);

    const fileBuffer = Buffer.from(String(dataBase64), 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ success: false, message: 'Invalid file content' });
    }
    if (fileBuffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File too large (max 15MB)' });
    }

    fs.writeFileSync(outPath, fileBuffer);
    const fileUrl = `/uploads/lab/${outName}`;
    return res.json({ success: true, fileUrl, fileName: outName });
  } catch (error) {
    console.error('Upload lab attachment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  SURGERIES
// ═══════════════════════════════════════════════

const SURGERY_TYPES = [
  'Minor Surgery',
  'Intermediate Surgery',
  'Major Ambulatory Surgery',
  'Day Surgery'
];

function normalizeSurgeryTypeInput(value) {
  const s = String(value ?? '').trim();
  if (!s) return 'Day Surgery';
  return SURGERY_TYPES.includes(s) ? s : null;
}

exports.getSurgeries = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const surgeries = await sequelize.query(
      `SELECT
         s.id,
         r.patient_id AS patientId,
         s.type AS type,
         s.start AS start,
         s.end AS end,
         COALESCE(NULLIF(TRIM(s.surgeon), ''), NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username) AS surgeonName,
         s.urgency AS urgency,
         s.result AS result,
         p.note AS note
       FROM SURGERY s
       JOIN PROCEDURE_ p ON p.order_id = s.id
       JOIN \`ORDER\` o ON o.id = s.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE r.patient_id = :patientId
       ORDER BY s.start DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, surgeries });
  } catch (error) {
    console.error('Get surgeries error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createSurgery = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { type, start, end, surgeonName, urgency, result, note } = req.body;
    const typeStr = normalizeSurgeryTypeInput(type);
    if (!typeStr) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${SURGERY_TYPES.join(', ')}`
      });
    }
    const startDt = start ? new Date(start) : new Date();
    const endDt = end ? new Date(end) : new Date(startDt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid start/end; end must be after start' });
    }
    const duration = Math.max(1, Math.round((endDt - startDt) / 60000));
    const urgRaw = String(urgency || 'MEDIUM').toUpperCase();
    const urg = ['HIGH', 'MEDIUM', 'LOW'].includes(urgRaw) ? urgRaw : 'MEDIUM';
    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      req.user.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Surgery',
      department: 'Surgery',
      diseaseId,
      transaction
    });
    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      { replacements: { status: 'active', treatmentId }, type: QueryTypes.INSERT, transaction }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create surgery order' });
    }
    const procType = typeStr.length > 100 ? typeStr.slice(0, 100) : typeStr;
    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: { orderId, note: note || null, doctorId, type: procType },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const surgeonVal = surgeonName != null && String(surgeonName).trim() ? String(surgeonName).trim().slice(0, 120) : null;
    await sequelize.query(
      `INSERT INTO SURGERY (id, duration, start, end, result, type, surgeon, urgency, note)
       VALUES (:id, :duration, :start, :end, :result, :type, :surgeon, :urgency, NULL)`,
      {
        replacements: {
          id: orderId,
          duration,
          start: startDt,
          end: endDt,
          result: result != null && String(result).trim() ? String(result).trim() : null,
          type: typeStr,
          surgeon: surgeonVal,
          urgency: urg
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const surgery = {
      id: orderId,
      patientId: patientPk,
      type: typeStr,
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      surgeonName: surgeonVal,
      urgency: urg,
      result: result != null && String(result).trim() ? String(result).trim() : null,
      note: note != null && String(note).trim() ? String(note).trim() : null
    };
    await transaction.commit();
    res.status(201).json({ success: true, surgery });
  } catch (error) {
    await transaction.rollback();
    console.error('Create surgery error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.updateSurgery = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { id } = req.params;
    const exists = await sequelize.query(
      `SELECT s.id
       FROM SURGERY s
       JOIN \`ORDER\` o ON o.id = s.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE s.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Surgery not found' });
    }
    const { type, start, end, surgeonName, urgency, result, note } = req.body;

    const curRows = await sequelize.query(
      'SELECT start, end, type, urgency, surgeon, result FROM SURGERY WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const cur = curRows[0];
    if (!cur) {
      return res.status(404).json({ success: false, message: 'Surgery not found' });
    }

    let nextType =
      type !== undefined ? normalizeSurgeryTypeInput(type) : String(cur.type || '').trim() || 'Day Surgery';
    if (type !== undefined && !nextType) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${SURGERY_TYPES.join(', ')}`
      });
    }
    if (!SURGERY_TYPES.includes(nextType)) {
      nextType = 'Day Surgery';
    }
    const nextStart = start !== undefined ? new Date(start) : new Date(cur.start);
    const nextEnd = end !== undefined ? new Date(end) : new Date(cur.end);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd <= nextStart) {
      return res.status(400).json({ success: false, message: 'Invalid start/end; end must be after start' });
    }
    const duration = Math.max(1, Math.round((nextEnd - nextStart) / 60000));
    let nextUrg = cur.urgency;
    if (urgency !== undefined) {
      const u = String(urgency).toUpperCase();
      nextUrg = ['HIGH', 'MEDIUM', 'LOW'].includes(u) ? u : 'MEDIUM';
    }
    const nextSurgeon =
      surgeonName !== undefined
        ? String(surgeonName).trim()
          ? String(surgeonName).trim().slice(0, 120)
          : null
        : cur.surgeon;
    const nextResult = result !== undefined ? result : cur.result;

    await sequelize.query(
      `UPDATE SURGERY SET
         type = :type,
         start = :start,
         end = :end,
         duration = :duration,
         urgency = :urgency,
         surgeon = :surgeon,
         result = :result
       WHERE id = :id`,
      {
        replacements: {
          id,
          type: nextType,
          start: nextStart,
          end: nextEnd,
          duration,
          urgency: nextUrg,
          surgeon: nextSurgeon,
          result: nextResult
        },
        type: QueryTypes.UPDATE
      }
    );
    await sequelize.query(
      'UPDATE PROCEDURE_ SET type = :ptype WHERE order_id = :id',
      {
        replacements: {
          id,
          ptype: nextType.length > 100 ? nextType.slice(0, 100) : nextType
        },
        type: QueryTypes.UPDATE
      }
    );
    if (note !== undefined) {
      await sequelize.query('UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id', {
        replacements: { id, note },
        type: QueryTypes.UPDATE
      });
    }

    const nrows = await sequelize.query('SELECT note FROM PROCEDURE_ WHERE order_id = :id LIMIT 1', {
      replacements: { id },
      type: QueryTypes.SELECT
    });
    const noteFinal = nrows[0]?.note ?? null;

    res.json({
      success: true,
      surgery: {
        id: Number(id),
        patientId: patientPk,
        type: nextType,
        start: nextStart.toISOString(),
        end: nextEnd.toISOString(),
        surgeonName: nextSurgeon,
        urgency: nextUrg,
        result: nextResult,
        note: noteFinal != null ? noteFinal : null
      }
    });
  } catch (error) {
    console.error('Update surgery error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  APPOINTMENTS (Doctor-specific)
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/appointments
 * Get all appointments for this doctor
 */
exports.getAppointments = async (req, res) => {
  try {
    const doctorUserId = req.user.userId;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: doctorUserId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.json({ success: true, appointments: [] });
    }

    const { status, startDate, endDate } = req.query;
    const replacements = {
      doctorId,
      startDate: startDate ? String(startDate) : null,
      endDate: endDate ? String(endDate) : null,
    };
    let statusFilter = '';
    if (status) {
      const normalized = String(status).toLowerCase();
      if (normalized === 'pending' || normalized === 'confirmed' || normalized === 'upcoming') {
        statusFilter = " AND a.status = 'scheduled' ";
      } else if (normalized === 'done' || normalized === 'completed') {
        statusFilter = " AND a.status = 'completed' ";
      } else if (normalized === 'cancelled' || normalized === 'rejected') {
        statusFilter = " AND a.status = 'cancelled' ";
      }
    }

    const rows = await sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status AS dbStatus,
         COALESCE(a.doctor_confirmed, 1) AS doctorConfirmed,
         a.\`condition\` AS symptoms,
         '' AS notes,
         cr.name AS room,
         COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
         p.user_id AS patientId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
       FROM APPOINTMENT a
       JOIN PATIENT p ON p.patient_id = a.patient_id
       JOIN USER u ON u.id = p.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.doctor_id = :doctorId
         AND (:startDate IS NULL OR DATE(a.time) >= :startDate)
         AND (:endDate IS NULL OR DATE(a.time) <= :endDate)
         ${statusFilter}
       ORDER BY a.time DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const appointments = rows.map((r) => {
      const confirmed = Number(r.doctorConfirmed) !== 0;
      const awaitingDoctorConfirmation =
        r.dbStatus === 'scheduled' && r.patientId != null && !confirmed;
      return {
        id: r.id,
        userId: r.patientId,
        patientId: r.patientId,
        patientName: r.patientName,
        doctor: req.user.username || '',
        assignedDoctorId: Number(doctorId),
        department: r.department || '',
        date: r.date,
        time: r.time,
        room: r.room || '',
        symptoms: r.symptoms || '',
        notes: r.notes || '',
        doctorConfirmed: confirmed,
        awaitingDoctorConfirmation,
        status: r.dbStatus === 'completed' ? 'Done' : r.dbStatus === 'cancelled' ? 'Cancelled' : 'Pending',
      };
    });

    res.json({ success: true, appointments });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/doctor/appointments
 * Doctor creates an appointment for a patient
 */
exports.createAppointment = async (req, res) => {
  try {
    const { patientId, department, date, time, room, symptoms, notes } = req.body;

    if (!patientId || !department || !date || !time) {
      return res.status(400).json({ success: false, message: 'Patient, department, date and time are required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id, room_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }
    const patientUserId = Number(String(patientId).replace(/^OP0*/i, ''));
    const patientRows = await sequelize.query(
      'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: patientUserId }, type: QueryTypes.SELECT }
    );
    const patientPk = patientRows[0]?.patient_id;
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Patient profile not found' });
    }
    const dateTime = `${date} ${String(time).slice(0, 8)}`;
    const existing = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId AND time = :dateTime AND status = 'scheduled'
       LIMIT 1`,
      { replacements: { doctorId, dateTime }, type: QueryTypes.SELECT }
    );
    if (existing[0]) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    }
    let roomId = doctorRows[0]?.room_id || null;
    if (!roomId && room) {
      const roomRows = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1',
        { replacements: { name: room }, type: QueryTypes.SELECT }
      );
      roomId = roomRows[0]?.id || null;
    }
    if (!roomId) {
      const fallback = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', { type: QueryTypes.SELECT });
      roomId = fallback[0]?.id || null;
    }
    if (!roomId) {
      return res.status(400).json({ success: false, message: 'No clinic room available' });
    }
    const [appointmentId] = await sequelize.query(
      `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
       VALUES (:dateTime, 'scheduled', :condition, :patientPk, :doctorId, :roomId, NULL, 1)`,
      {
        replacements: {
          dateTime,
          condition: symptoms || notes || 'General consultation',
          patientPk,
          doctorId,
          roomId
        },
        type: QueryTypes.INSERT
      }
    );
    const appointment = {
      id: appointmentId,
      patientId: patientUserId,
      department,
      date,
      time,
      room: room || '',
      symptoms: symptoms || '',
      notes: notes || '',
      status: 'Pending'
    };
    res.status(201).json({ success: true, appointment });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * Resolve PATIENT.patient_id from route param (supports OP-padded id or raw user_id / patient_id).
 */
async function resolvePatientPkFromRouteParam(patientIdParam, transaction) {
  const routeVal = parseRoutePatientId(patientIdParam);
  if (!routeVal) return null;
  const rows = await sequelize.query(
    `SELECT patient_id FROM PATIENT WHERE user_id = :v OR patient_id = :v LIMIT 1`,
    { replacements: { v: routeVal }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.patient_id ?? null;
}

/** Align PATIENT.in_dept with CLINIC_ROOM.department_id (same idea as nurse check-in sync). */
async function syncPatientInDeptFromClinicRoom(patientPk, roomId, transaction) {
  const [row] = await sequelize.query(
    'SELECT department_id AS departmentId FROM CLINIC_ROOM WHERE id = :roomId LIMIT 1',
    { replacements: { roomId }, type: QueryTypes.SELECT, transaction }
  );
  const raw = row?.departmentId != null ? Number(row.departmentId) : null;
  const deptId = Number.isFinite(raw) ? raw : null;
  await sequelize.query('UPDATE PATIENT SET in_dept = :deptId WHERE patient_id = :patientPk', {
    replacements: { patientPk, deptId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

/**
 * POST /api/doctor/patients/:patientId/transfers
 * Creates ORDER + TRANSFERENCE + CLINIC_TRANSFERENCE or HOSPITAL_TRANSFERENCE.
 */
exports.createPatientTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      req.user.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const {
      kind,
      reason,
      note,
      fromRoomId,
      toRoomId,
      toHospitalId,
      toHospitalName,
      transport,
      formPayload,
    } = req.body || {};

    const k = String(kind || '').toLowerCase();
    if (!reason || !String(reason).trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Transfer reason is required' });
    }
    if (k !== 'clinic' && k !== 'hospital') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'kind must be "clinic" or "hospital"' });
    }

    let clinicTransferToRoomId = null;

    const diseaseId = await ensureDisease('Z75.1', 'Patient transfer', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: String(reason).trim(),
      department: k === 'clinic' ? 'Clinic transfer' : 'Hospital transfer',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create transfer order' });
    }

    await sequelize.query(
      `INSERT INTO TRANSFERENCE (order_id, reason, time, note)
       VALUES (:orderId, :reason, NOW(), :note)`,
      {
        replacements: {
          orderId,
          reason: String(reason).trim(),
          note: note != null && String(note).trim() !== '' ? String(note).trim() : null,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    if (k === 'clinic') {
      const fromR = Number(fromRoomId);
      const toR = Number(toRoomId);
      if (!Number.isFinite(fromR) || fromR <= 0 || !Number.isFinite(toR) || toR <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'fromRoomId and toRoomId are required for clinic transfer' });
      }
      if (fromR === toR) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'From and to room must differ' });
      }
      await sequelize.query(
        `INSERT INTO CLINIC_TRANSFERENCE (transference_id, from_room_id, to_room_id)
         VALUES (:orderId, :fromRoomId, :toRoomId)`,
        {
          replacements: { orderId, fromRoomId: fromR, toRoomId: toR },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
      await syncPatientInDeptFromClinicRoom(patientPk, toR, transaction);
      clinicTransferToRoomId = toR;
    } else {
      const name = String(toHospitalName || '').trim();
      if (!name) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'toHospitalName is required for hospital transfer' });
      }
      let formPayloadJson = null;
      if (formPayload != null && typeof formPayload === 'object') {
        try {
          formPayloadJson = JSON.stringify(formPayload);
        } catch {
          formPayloadJson = null;
        }
      } else if (typeof formPayload === 'string' && String(formPayload).trim() !== '') {
        formPayloadJson = String(formPayload).trim();
      }
      await sequelize.query(
        `INSERT INTO HOSPITAL_TRANSFERENCE (transference_id, to_id, to_name, transport, form_payload)
         VALUES (:orderId, :toId, :toName, :transport, :formPayload)`,
        {
          replacements: {
            orderId,
            toId: toHospitalId != null && String(toHospitalId).trim() !== '' ? String(toHospitalId).trim() : null,
            toName: name,
            transport: transport != null && String(transport).trim() !== '' ? String(transport).trim() : null,
            formPayload: formPayloadJson,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    await transaction.commit();

    if (clinicTransferToRoomId != null) {
      await notifyDepartmentDoctorsInboundClinicTransfer(sequelize, {
        toRoomId: clinicTransferToRoomId,
        patientPk,
        reason: String(reason).trim(),
        note:
          note != null && String(note).trim() !== ''
            ? String(note).trim()
            : '',
      });
    }

    res.status(201).json({
      success: true,
      transfer: {
        orderId,
        treatmentId,
        kind: k,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create patient transfer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/appointments/:id/cover
 * Reassign this slot to another doctor in the same department (patient is notified if booked).
 */
exports.coverAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const coverReason = String(req.body?.reason ?? req.body?.coverReason ?? '').trim();
    if (!coverReason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const coverDoctorId = Number(req.body?.coverDoctorId);
    if (!Number.isFinite(coverDoctorId) || coverDoctorId <= 0) {
      return res.status(400).json({ success: false, message: 'coverDoctorId is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const myDoctorId = doctorRows[0]?.doctor_id;
    if (!myDoctorId) {
      return res.status(403).json({ success: false, message: 'Doctor profile not found' });
    }

    const [appt] = await sequelize.query(
      `SELECT
         a.id,
         a.patient_id AS patientId,
         a.doctor_id AS doctorId,
         a.room_id AS roomId,
         a.time AS slotTime,
         a.status
       FROM APPOINTMENT a
       WHERE a.id = :id AND a.doctor_id = :myDoctorId AND a.status = 'scheduled'
       LIMIT 1`,
      { replacements: { id, myDoctorId }, type: QueryTypes.SELECT }
    );
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (Number(appt.doctorId) === coverDoctorId) {
      return res.status(400).json({ success: false, message: 'Choose a different doctor' });
    }

    const [slotDeptRow] = await sequelize.query(
      `SELECT cr.department_id AS deptId
       FROM APPOINTMENT a
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       WHERE a.id = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const slotDeptId =
      slotDeptRow?.deptId != null && Number.isFinite(Number(slotDeptRow.deptId))
        ? Number(slotDeptRow.deptId)
        : null;

    if (slotDeptId) {
      const [inSlotDept] = await sequelize.query(
        `SELECT 1 AS ok
         FROM DOCTOR_DEPARTMENT
         WHERE doctor_id = :did AND department_id = :deptId
         LIMIT 1`,
        { replacements: { did: coverDoctorId, deptId: slotDeptId }, type: QueryTypes.SELECT }
      );
      if (!inSlotDept) {
        return res.status(400).json({
          success: false,
          message: 'Covering doctor must work in the same department as this appointment room',
        });
      }
    } else {
      const [share] = await sequelize.query(
        `SELECT 1 AS ok
         FROM DOCTOR_DEPARTMENT dd1
         INNER JOIN DOCTOR_DEPARTMENT dd2 ON dd1.department_id = dd2.department_id
         WHERE dd1.doctor_id = :a AND dd2.doctor_id = :b
         LIMIT 1`,
        { replacements: { a: myDoctorId, b: coverDoctorId }, type: QueryTypes.SELECT }
      );
      if (!share) {
        return res.status(400).json({
          success: false,
          message: 'Covering doctor must work in the same department as you',
        });
      }
    }

    // Keep the booked slot's room. Changing to the cover doctor's default room can violate
    // UNIQUE(time, doctor_id, room_id) if that doctor already has (even cancelled) history at the same time+room.
    const roomIdNum =
      appt.roomId != null && appt.roomId !== '' && Number.isFinite(Number(appt.roomId))
        ? Number(appt.roomId)
        : null;

    const [conflict] = await sequelize.query(
      `SELECT x.id FROM APPOINTMENT x
       WHERE x.doctor_id = :doctorId
         AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
         AND x.status = 'scheduled'
         AND x.id <> :id
       LIMIT 1`,
      { replacements: { doctorId: coverDoctorId, id }, type: QueryTypes.SELECT }
    );
    if (conflict?.id) {
      return res.status(409).json({
        success: false,
        message: 'That doctor already has another appointment at this time',
      });
    }

    const [dupTriple] = await sequelize.query(
      `SELECT x.id FROM APPOINTMENT x
       WHERE x.doctor_id = :doctorId
         AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
         AND x.room_id = (SELECT a3.room_id FROM APPOINTMENT a3 WHERE a3.id = :id LIMIT 1)
         AND x.id <> :id
       LIMIT 1`,
      { replacements: { doctorId: coverDoctorId, id }, type: QueryTypes.SELECT }
    );
    if (dupTriple?.id) {
      return res.status(409).json({
        success: false,
        message: 'Cannot assign cover: this time and room are already tied to another record for that doctor',
      });
    }

    const [od] = await sequelize.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
       FROM DOCTOR d
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE d.doctor_id = :did LIMIT 1`,
      { replacements: { did: myDoctorId }, type: QueryTypes.SELECT }
    );
    const oldDoctorLabel = od?.name ? `Dr. ${String(od.name).trim()}` : `Doctor #${myDoctorId}`;

    await sequelize.query(`UPDATE APPOINTMENT SET doctor_id = :cid WHERE id = :id`, {
      replacements: { cid: coverDoctorId, id },
      type: QueryTypes.UPDATE,
    });

    const [nd] = await sequelize.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
       FROM DOCTOR d
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE d.doctor_id = :did LIMIT 1`,
      { replacements: { did: coverDoctorId }, type: QueryTypes.SELECT }
    );
    const newDoctorLabel = nd?.name ? `Dr. ${String(nd.name).trim()}` : `Doctor #${coverDoctorId}`;

    if (appt.patientId) {
      const [meta] = await sequelize.query(
        `SELECT
           DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
           DATE_FORMAT(a.time, '%H:%i') AS timeVi,
           COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName
         FROM APPOINTMENT a
         JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.id = :id LIMIT 1`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );
      await notifyPatientAppointmentDoctorReassigned(sequelize, {
        patientId: Number(appt.patientId),
        dateVi: meta?.dateVi || '',
        timeVi: meta?.timeVi || '',
        department: meta?.depName || '',
        oldDoctorName: oldDoctorLabel,
        newDoctorName: newDoctorLabel,
        reason: coverReason,
      });
    }

    await notifyDoctorReceivedCoverAppointment(sequelize, {
      appointmentId: Number(id),
      previousDoctorLabel: oldDoctorLabel,
    });

    return res.json({
      success: true,
      appointment: { id: Number(id), doctorId: coverDoctorId, roomId: roomIdNum },
    });
  } catch (error) {
    console.error('Cover appointment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/appointments/:id/cancel
 * Cancel an appointment
 */
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [row] = await sequelize.query(
      `SELECT id, patient_id AS patientPk, COALESCE(doctor_confirmed, 1) AS dc, status
       FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!row?.id) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(row.status).toLowerCase() !== 'scheduled') {
      return res.status(400).json({ success: false, message: 'Only scheduled visits can be cancelled here' });
    }
    if (Number(row.dc) === 0) {
      return res.status(400).json({
        success: false,
        message: 'This booking is not yet accepted. Use Decline to release the slot, or Accept first.',
      });
    }
    if (row.patientPk == null) {
      return res.status(400).json({ success: false, message: 'No patient is booked on this slot' });
    }
    await sequelize.query(
      `UPDATE APPOINTMENT SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id`,
      { replacements: { id, reason }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorCover(sequelize, id, reason);
    res.json({ success: true, appointment: { id: Number(id), status: 'Cancelled' } });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/appointments/:id/decline
 * Release a patient-requested slot (doctor_confirmed = 0) before acceptance.
 */
exports.declineAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [appt] = await sequelize.query(
      `SELECT
         a.patient_id AS patientPk,
         COALESCE(a.doctor_confirmed, 1) AS dc,
         a.status,
         DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
         DATE_FORMAT(a.time, '%H:%i') AS timeVi,
         COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorNameRaw
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN USER du ON du.id = d.user_id
       JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.id = :id AND a.doctor_id = :doctorId
       LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(appt.status).toLowerCase() !== 'scheduled' || appt.patientPk == null || Number(appt.dc) !== 0) {
      return res.status(400).json({ success: false, message: 'Only pending patient booking requests can be declined' });
    }
    const patientPk = Number(appt.patientPk);
    const doctorLabel = appt.doctorNameRaw ? `Dr. ${String(appt.doctorNameRaw).trim()}` : `Doctor #${doctorId}`;
    await sequelize.query(
      `UPDATE APPOINTMENT
       SET patient_id = NULL,
           \`condition\` = 'Open slot',
           doctor_confirmed = 1,
           doctor_decline_reason = :reason
       WHERE id = :id AND doctor_id = :doctorId`,
      { replacements: { id, doctorId, reason }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorDeclinedBooking(sequelize, {
      patientId: patientPk,
      doctorLabel,
      dateVi: appt.dateVi || '',
      timeVi: appt.timeVi || '',
      department: appt.depName || '',
      reason,
    });
    res.json({ success: true, appointment: { id: Number(id), status: 'Open' } });
  } catch (error) {
    console.error('Decline appointment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/appointments/:id/confirm
 * Confirm a pending appointment
 */
exports.confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [row] = await sequelize.query(
      `SELECT id, patient_id AS patientPk, COALESCE(doctor_confirmed, 1) AS dc, status
       FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!row?.id) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(row.status).toLowerCase() !== 'scheduled' || row.patientPk == null) {
      return res.status(400).json({ success: false, message: 'Nothing to confirm on this slot' });
    }
    if (Number(row.dc) !== 0) {
      return res.json({ success: true, appointment: { id: Number(id), status: 'Pending', doctorConfirmed: true } });
    }
    await sequelize.query(
      `UPDATE APPOINTMENT SET doctor_confirmed = 1, status = 'scheduled' WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorAcceptedBooking(sequelize, id);
    res.json({ success: true, appointment: { id: Number(id), status: 'Pending', doctorConfirmed: true } });
  } catch (error) {
    console.error('Confirm appointment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  DOCTOR DASHBOARD
// ═══════════════════════════════════════════════

exports.getDashboardSummary = async (req, res) => {
  try {
    if (req.user.role === 'technician') {
      const techRows = await sequelize.query(
        'SELECT technician_id FROM TECHNICIAN WHERE user_id = :userId LIMIT 1',
        { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
      );
      const technicianId = techRows[0]?.technician_id ?? null;

      const [
        labAllTodayRows,
        myLabsTodayRows,
        pendingInputRows,
        queueRows,
        recentPatientRows,
      ] = await Promise.all([
        sequelize.query(
          `SELECT COUNT(*) AS cnt FROM TEST WHERE DATE(time) = CURDATE()`,
          { type: QueryTypes.SELECT }
        ),
        technicianId
          ? sequelize.query(
              `SELECT COUNT(DISTINCT tst.id) AS cnt
               FROM TEST tst
               LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
               WHERE DATE(tst.time) = CURDATE()
                 AND (tst.technician_id = :tid OR p.technician_id = :tid)`,
              { replacements: { tid: technicianId }, type: QueryTypes.SELECT }
            )
          : Promise.resolve([{ cnt: 0 }]),
        sequelize.query(
          `SELECT COUNT(*) AS cnt
           FROM TEST tst
           WHERE DATE(tst.time) = CURDATE()
             AND (tst.attachment_url IS NULL OR TRIM(COALESCE(tst.attachment_url, '')) = '')
             AND (tst.result IS NULL OR TRIM(COALESCE(tst.result, '')) = '')`,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             tst.id AS labId,
             tst.type AS testType,
             tst.time AS testTime,
             tst.result AS labResult,
             tst.attachment_url AS attachmentUrl,
             r.patient_id AS patientId,
             COALESCE(
               NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
               acc.username,
               CONCAT('patient#', r.patient_id)
             ) AS patientName
           FROM TEST tst
           JOIN \`ORDER\` o ON o.id = tst.id
           JOIN TREATMENT t ON t.id = o.treatment_id
           JOIN REGIMEN r ON r.id = t.regimen_id
           JOIN USER u ON u.id = r.patient_id
           LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
           WHERE DATE(tst.time) = CURDATE()
           ORDER BY tst.time DESC
           LIMIT 12`,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             r.patient_id AS patientId,
             COALESCE(
               NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
               acc.username,
               CONCAT('patient#', r.patient_id)
             ) AS patientName,
             MAX(tst.time) AS lastTime
           FROM TEST tst
           JOIN \`ORDER\` o ON o.id = tst.id
           JOIN TREATMENT t ON t.id = o.treatment_id
           JOIN REGIMEN r ON r.id = t.regimen_id
           JOIN USER u ON u.id = r.patient_id
           LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
           GROUP BY r.patient_id, patientName
           ORDER BY lastTime DESC
           LIMIT 8`,
          { type: QueryTypes.SELECT }
        ),
      ]);

      const toUiStatus = (row) => {
        const hasAttachment = row.attachmentUrl && String(row.attachmentUrl).trim().length > 0;
        const hasResult = row.labResult && String(row.labResult).trim().length > 0;
        return hasAttachment || hasResult ? 'Done' : 'Pending';
      };

      return res.json({
        success: true,
        summary: {
          appointmentsToday: Number(pendingInputRows?.[0]?.cnt ?? 0),
          diagnosesToday: Number(myLabsTodayRows?.[0]?.cnt ?? 0),
          prescriptionsToday: 0,
          labTestsToday: Number(labAllTodayRows?.[0]?.cnt ?? 0),
        },
        todaysSchedule: (queueRows || []).map((r) => {
          const d = r.testTime ? new Date(r.testTime) : null;
          return {
            id: Number(r.labId),
            date: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '',
            time: d && !Number.isNaN(d.getTime()) ? d.toTimeString().slice(0, 8) : '',
            department: String(r.testType || ''),
            room: '',
            patientId: Number(r.patientId),
            patientName: String(r.patientName || ''),
            status: toUiStatus(r),
          };
        }),
        recentPatients: (recentPatientRows || []).map((r) => ({
          patientId: Number(r.patientId),
          patientName: String(r.patientName || ''),
          lastTime: r.lastTime,
        })),
      });
    }

    const doctorUserId = req.user.userId;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: doctorUserId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.json({
        success: true,
        summary: {
          appointmentsToday: 0,
          diagnosesToday: 0,
          prescriptionsToday: 0,
          labTestsToday: 0,
        },
        todaysSchedule: [],
        recentPatients: [],
      });
    }

    const [
      apptCountRows,
      diagCountRows,
      rxCountRows,
      labCountRows,
      scheduleRows,
      recentRows,
    ] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*) AS cnt
         FROM APPOINTMENT a
         WHERE a.doctor_id = :doctorId
           AND DATE(a.time) = CURDATE()
           AND a.status <> 'cancelled'`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS cnt
         FROM TREATMENT t
         WHERE t.doctor_id = :doctorId
           AND DATE(t.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT rx.order_id) AS cnt
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         WHERE t.doctor_id = :doctorId
           AND DATE(rx.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT tst.id) AS cnt
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         WHERE t.doctor_id = :doctorId
           AND DATE(tst.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           a.id,
           DATE(a.time) AS date,
           TIME(a.time) AS time,
           a.status AS dbStatus,
           COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
           cr.name AS room,
           p.user_id AS patientId,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
         FROM APPOINTMENT a
         JOIN PATIENT p ON p.patient_id = a.patient_id
         JOIN USER u ON u.id = p.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.doctor_id = :doctorId
           AND DATE(a.time) = CURDATE()
           AND a.status <> 'cancelled'
         ORDER BY a.time ASC
         LIMIT 8`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT DISTINCT
           p.user_id AS patientId,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName,
           MAX(a.time) AS lastTime
         FROM APPOINTMENT a
         JOIN PATIENT p ON p.patient_id = a.patient_id
         JOIN USER u ON u.id = p.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
         WHERE a.doctor_id = :doctorId
         GROUP BY p.user_id, patientName
         ORDER BY lastTime DESC
         LIMIT 5`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
    ]);

    const toUiStatus = (dbStatus) =>
      dbStatus === 'completed' ? 'Done' : dbStatus === 'cancelled' ? 'Cancelled' : 'Pending';

    res.json({
      success: true,
      summary: {
        appointmentsToday: Number(apptCountRows?.[0]?.cnt || 0),
        diagnosesToday: Number(diagCountRows?.[0]?.cnt || 0),
        prescriptionsToday: Number(rxCountRows?.[0]?.cnt || 0),
        labTestsToday: Number(labCountRows?.[0]?.cnt || 0),
      },
      todaysSchedule: (scheduleRows || []).map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        department: r.department || '',
        room: r.room || '',
        patientId: r.patientId,
        patientName: r.patientName,
        status: toUiStatus(r.dbStatus),
      })),
      recentPatients: (recentRows || []).map((r) => ({
        patientId: r.patientId,
        patientName: r.patientName,
        lastTime: r.lastTime,
      })),
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  DOCTOR SIGNATURE
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/signature
 * Get the current doctor's signature
 */
exports.getSignature = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doctorId = await getDoctorIdByUserId(userId);
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    const [row] = await sequelize.query(
      'SELECT signature FROM DOCTOR WHERE doctor_id = :doctorId LIMIT 1',
      { replacements: { doctorId }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      signature: row?.signature || null,
    });
  } catch (error) {
    console.error('Get signature error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/doctor/signature
 * Save the doctor's signature (base64 data URL)
 */
exports.saveSignature = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { signature } = req.body;
    const doctorId = await getDoctorIdByUserId(userId);
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    await sequelize.query(
      'UPDATE DOCTOR SET signature = :signature WHERE doctor_id = :doctorId',
      { replacements: { signature: signature || null, doctorId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Save signature error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};