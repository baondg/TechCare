const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const Account = require('../../models/Account');
const User = require('../../models/Users');
const cacheService = require('../../services/cacheService');
const nurseCheckInRepository = require('../../repositories/nurseCheckInRepository');
const logger = require('../../common/logger');
const { config } = require('../../config/env');
const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS } = require('../../services/emr/treatmentService');
const { PATIENT_RECORD_CACHE_TTL_SECONDS } = require('../../services/emr/patientRecordCache');

const isHotpathProfilingEnabled = () => config.profileHotpaths;

async function buildTodayAppointmentForPatientPk(patientPk) {
  const pk = Number(patientPk);
  if (!Number.isFinite(pk) || pk <= 0) return null;
  const booked = await nurseCheckInRepository.listNurseBookedTodayForPatient(pk);
  const ar = booked?.[0];
  if (!ar) return null;
  const wallTimeRaw = ar.wallTime != null ? String(ar.wallTime).split('.')[0] : '';
  const timeDisplay = wallTimeRaw.length >= 5 ? wallTimeRaw.slice(0, 5) : '';
  const regimenId = ar.regimenId != null ? Number(ar.regimenId) : null;
  let checkedIn = false;
  if (Number.isFinite(regimenId) && regimenId > 0) {
    const open = await nurseCheckInRepository.findOpenRegimenForPatient(regimenId, pk);
    checkedIn = Boolean(open);
  }
  const roomId = ar.roomId != null ? Number(ar.roomId) : null;
  return {
    appointmentId: Number(ar.id),
    timeDisplay,
    checkedIn,
    roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : null,
    roomName: ar.roomName != null ? String(ar.roomName) : '',
  };
}

function bmiFromHeightWeightCm(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w) return null;
  const heightInM = h / 100;
  return +(w / (heightInM ** 2)).toFixed(1);
}

/**
 * Batch: user_id -> patient_id for PAT rows.
 * @param {number[]} userIds
 * @returns {Promise<Map<number, number>>}
 */
async function batchUserIdToPatientPk(userIds) {
  const map = new Map();
  if (!userIds.length) return map;
  const ph = userIds.map(() => '?').join(',');
  const rows = await sequelize.query(
    `SELECT user_id AS userId, patient_id AS patientPk FROM PATIENT WHERE user_id IN (${ph})`,
    { replacements: userIds, type: QueryTypes.SELECT }
  );
  for (const row of rows) {
    if (row.userId != null && row.patientPk != null) {
      map.set(Number(row.userId), Number(row.patientPk));
    }
  }
  return map;
}

/**
 * Latest standalone diagnosis per patient PK (same rules as getLatestDiagnosisByPatientId).
 * @param {number[]} patientPks
 * @returns {Promise<Map<number, object>>} patientPk -> row (visitTime, icd10, interpretation, doctorName, …)
 */
async function batchLatestDiagnosisByPatientPks(patientPks) {
  const map = new Map();
  if (!patientPks.length) return map;
  const ph = patientPks.map(() => '?').join(',');
  const sql = `
    SELECT * FROM (
      SELECT
        r.patient_id AS patientPk,
        t.time AS visitTime,
        t.type AS department,
        t.\`condition\` AS complaint,
        dis.icd_code AS icd10,
        dis.description AS interpretation,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
        ROW_NUMBER() OVER (PARTITION BY r.patient_id ORDER BY t.time DESC, t.id DESC) AS rn
      FROM TREATMENT t
      JOIN REGIMEN r ON r.id = t.regimen_id
      LEFT JOIN DISEASE dis ON dis.id = r.disease_id
      LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
      LEFT JOIN USER u ON u.id = d.user_id
      LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
      WHERE r.patient_id IN (${ph})
      ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
    ) ranked
    WHERE ranked.rn = 1`;
  const rows = await sequelize.query(sql, { replacements: patientPks, type: QueryTypes.SELECT });
  for (const row of rows) {
    if (row.patientPk != null) map.set(Number(row.patientPk), row);
  }
  return map;
}

/**
 * Latest MEDICAL_RECORD row per patient (for list BMI), matching HealthInfo.findOne order by time DESC.
 * @param {number[]} patientPks
 * @returns {Promise<Map<number, number|null>>} patientPk -> bmi or null
 */
async function batchLatestBmiByPatientPks(patientPks) {
  const map = new Map();
  if (!patientPks.length) return map;
  const ph = patientPks.map(() => '?').join(',');
  const sql = `
    SELECT * FROM (
      SELECT
        patient_id AS patientPk,
        weight,
        height,
        ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY time DESC, id DESC) AS rn
      FROM MEDICAL_RECORD
      WHERE patient_id IN (${ph})
    ) x
    WHERE x.rn = 1`;
  const rows = await sequelize.query(sql, { replacements: patientPks, type: QueryTypes.SELECT });
  for (const row of rows) {
    if (row.patientPk != null) {
      map.set(Number(row.patientPk), bmiFromHeightWeightCm(row.height, row.weight));
    }
  }
  return map;
}

/**
 * Fast path for single-patient detail endpoint.
 * Avoids ROW_NUMBER window scans used by batch helpers.
 * @param {number|null} patientPk
 * @returns {Promise<object|null>}
 */
async function getLatestDiagnosisByPatientPkFast(patientPk) {
  if (!Number.isFinite(Number(patientPk)) || Number(patientPk) <= 0) return null;
  const [row] = await sequelize.query(
    `SELECT
       t.time AS visitTime,
       t.type AS department,
       t.\`condition\` AS complaint,
       dis.icd_code AS icd10,
       dis.description AS interpretation,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
         a.username,
         CONCAT('doctor#', d.user_id)
       ) AS doctorName
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE r.patient_id = :patientPk
     ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { patientPk: Number(patientPk) }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/**
 * Fast path for single-patient detail endpoint.
 * @param {number|null} patientPk
 * @returns {Promise<number|null>}
 */
async function getLatestBmiByPatientPkFast(patientPk) {
  if (!Number.isFinite(Number(patientPk)) || Number(patientPk) <= 0) return null;
  const [row] = await sequelize.query(
    `SELECT weight, height
     FROM MEDICAL_RECORD
     WHERE patient_id = :patientPk
     ORDER BY time DESC, id DESC
     LIMIT 1`,
    { replacements: { patientPk: Number(patientPk) }, type: QueryTypes.SELECT }
  );
  return row ? bmiFromHeightWeightCm(row.height, row.weight) : null;
}

/**
 * Fast path for department resolution in patient detail endpoint.
 * Prefer latest treatment department, then latest appointment room department.
 * @param {number|null} patientPk
 * @returns {Promise<{ inDepartment: string|null, inDeptId: number|null }>}
 */
async function getCurrentDepartmentByPatientPkFast(patientPk) {
  if (!Number.isFinite(Number(patientPk)) || Number(patientPk) <= 0) {
    return { inDepartment: null, inDeptId: null };
  }
  const numericPatientPk = Number(patientPk);
  const [latestTreatmentDept, latestAppointmentDept] = await Promise.all([
    sequelize.query(
      `SELECT dep.name AS inDepartment, t.dept_id AS inDeptId
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DEPARTMENT dep ON dep.id = t.dept_id
       WHERE r.patient_id = :patientPk
         AND t.dept_id IS NOT NULL
       ORDER BY t.time DESC, t.id DESC
       LIMIT 1`,
      { replacements: { patientPk: numericPatientPk }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT dep.name AS inDepartment, cr.department_id AS inDeptId
       FROM APPOINTMENT a
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.patient_id = :patientPk
       ORDER BY a.time DESC, a.id DESC
       LIMIT 1`,
      { replacements: { patientPk: numericPatientPk }, type: QueryTypes.SELECT }
    )
  ]);
  const treatment = latestTreatmentDept?.[0] || null;
  if (treatment?.inDeptId != null) {
    return {
      inDepartment: treatment.inDepartment != null ? String(treatment.inDepartment) : null,
      inDeptId: Number(treatment.inDeptId),
    };
  }
  const appointment = latestAppointmentDept?.[0] || null;
  return {
    inDepartment: appointment?.inDepartment != null ? String(appointment.inDepartment) : null,
    inDeptId: appointment?.inDeptId != null ? Number(appointment.inDeptId) : null,
  };
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
    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;
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
      limit: limitNum,
      offset
    });

    const userIds = patients.map((patient) => patient.id);
    const deptByUserId = new Map();
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const deptRows = await sequelize.query(
        `SELECT
           pt.user_id AS userId,
           COALESCE(
             (
               SELECT dep_t.name
               FROM TREATMENT t
               JOIN REGIMEN r ON r.id = t.regimen_id
               LEFT JOIN DEPARTMENT dep_t ON dep_t.id = t.dept_id
               WHERE r.patient_id = pt.patient_id
                 AND t.dept_id IS NOT NULL
               ORDER BY t.time DESC, t.id DESC
               LIMIT 1
             ),
             (
               SELECT dep_a.name
               FROM APPOINTMENT a2
               JOIN CLINIC_ROOM cr2 ON cr2.id = a2.room_id
               LEFT JOIN DEPARTMENT dep_a ON dep_a.id = cr2.department_id
               WHERE a2.patient_id = pt.patient_id
               ORDER BY a2.time DESC, a2.id DESC
               LIMIT 1
             )
           ) AS inDepartment
         FROM PATIENT pt
         WHERE pt.user_id IN (${placeholders})`,
        { replacements: userIds, type: QueryTypes.SELECT }
      );
      for (const r of deptRows) {
        deptByUserId.set(Number(r.userId), r.inDepartment != null ? String(r.inDepartment) : null);
      }
    }

    const userToPatientPk = await batchUserIdToPatientPk(userIds);
    const patientPks = [...new Set(userIds.map((uid) => userToPatientPk.get(uid)).filter((pk) => pk != null))];
    const [diagByPatientPk, bmiByPatientPk] = await Promise.all([
      batchLatestDiagnosisByPatientPks(patientPks),
      batchLatestBmiByPatientPks(patientPks),
    ]);

    const enrichedPatients = patients.map((patient) => {
      const p = patient.toJSON();
      const patientPk = userToPatientPk.get(p.id) ?? null;
      const latestDiagnosis =
        patientPk != null ? diagByPatientPk.get(patientPk) || null : null;
      const doctorFullName = latestDiagnosis?.doctorName || null;
      const bmi = patientPk != null ? bmiByPatientPk.get(patientPk) ?? null : null;

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
        bmi,
        inDepartment: deptByUserId.get(p.id) ?? null
      };
    });


    res.json({
      success: true,
      patients: enrichedPatients,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Get patients error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/patients/:patientId
 * Get a single patient's basic info
 */
exports.getPatient = async (req, res) => {
  try {
    const routeStartedAt = Date.now();
    const { patientId } = req.params;

    // Medical staff can view patient details from EMR pages
    if (!["doctor", "admin", "nurse", "technician"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const routeId = Number(String(patientId || '').replace(/^OP0*/i, ''));
    if (!Number.isFinite(routeId) || routeId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }

    const [basePatient] = await sequelize.query(
      `SELECT
         u.id,
         u.email,
         u.first_name,
         u.last_name,
         u.dob,
         u.sex,
         u.idcard,
         u.tel,
         p.patient_id AS patientPk,
         acc.username,
         hi.id AS healthInsuranceId,
         hi.expired_date AS healthInsuranceExpiredDate
       FROM USER u
       LEFT JOIN PATIENT p ON p.user_id = u.id
       LEFT JOIN ACCOUNT acc ON acc.user_id = u.id
       LEFT JOIN HEALTH_INSURANCE hi ON hi.patient_id = p.patient_id
       WHERE u.id = :routeId OR p.patient_id = :routeId
       ORDER BY CASE WHEN u.id = :routeId THEN 0 ELSE 1 END
       LIMIT 1`,
      { replacements: { routeId }, type: QueryTypes.SELECT }
    );

    if (!basePatient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const p = basePatient;
    const patientPk = p.patientPk != null ? Number(p.patientPk) : null;
    const cacheKey = patientPk ? `doctor:patient_record:v1:${patientPk}` : null;
    if (cacheKey) {
      const cached = await cacheService.getJson(cacheKey);
      if (cached) {
        if (isHotpathProfilingEnabled()) {
          logger.info({ ms: Date.now() - routeStartedAt, patientPk, cache: 'hit' }, 'perf.getPatient');
        }
        return res.json(cached);
      }
    }
    const [latestDiagnosis, bmi, dept, todayAppointment] = await Promise.all([
      getLatestDiagnosisByPatientPkFast(patientPk),
      getLatestBmiByPatientPkFast(patientPk),
      getCurrentDepartmentByPatientPkFast(patientPk),
      buildTodayAppointmentForPatientPk(patientPk),
    ]);

    const responsePayload = {
      success: true,
      patient: {
        id: p.id,
        patientPk: patientPk != null ? patientPk : null,
        username: p.username || "",
        firstName: p.first_name,
        lastName: p.last_name,
        idCard: p.idcard || null,
        phone: p.tel || null,
        gender: p.sex,
        dateOfBirth: p.dob || null,
        age: calculateAge(p.dob),
        latestDiagnosis: latestDiagnosis ? {
          icd10: latestDiagnosis.icd10 || '',
          interpretation: latestDiagnosis.interpretation || '',
          department: latestDiagnosis.department || '',
          doctorName: latestDiagnosis.doctorName || ''
        } : null,
        /** Derived from latest TREATMENT.dept_id, fallback APPOINTMENT room department */
        inDepartment: dept.inDepartment || null,
        inDeptId: dept.inDeptId,
        bmi: bmi,
        healthInsuranceId: p.healthInsuranceId || null,
        healthInsuranceExpiredDate: p.healthInsuranceExpiredDate || null,
        bloodType: null,
        todayAppointment,
      }
    };
    if (cacheKey) {
      await cacheService.setJson(cacheKey, responsePayload, PATIENT_RECORD_CACHE_TTL_SECONDS);
    }
    if (isHotpathProfilingEnabled()) {
      logger.info({ ms: Date.now() - routeStartedAt, patientPk, cache: 'miss' }, 'perf.getPatient');
    }
    res.json(responsePayload);
  } catch (error) {
    logger.error({ err: error }, 'Get patient error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
