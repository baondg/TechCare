const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
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

async function getDoctorIdByUserId(userId, transaction) {
  const row = await sequelize.query(
    'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT, transaction }
  );
  return row[0]?.doctor_id || null;
}

async function ensureDisease(icd10, interpretation, transaction) {
  const found = await sequelize.query(
    'SELECT id FROM DISEASE WHERE icd_code = :icd LIMIT 1',
    { replacements: { icd: icd10 }, type: QueryTypes.SELECT, transaction }
  );
  if (found[0]?.id) return found[0].id;

  const [result] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES (:icd, :description, 'General', NULL)`,
    {
      replacements: { icd: icd10, description: interpretation || icd10 },
      type: QueryTypes.INSERT,
      transaction
    }
  );
  return result;
}

async function ensureRegimen(patientId, diseaseId, transaction) {
  const found = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND disease_id = :diseaseId
     ORDER BY id DESC LIMIT 1`,
    { replacements: { patientId, diseaseId }, type: QueryTypes.SELECT, transaction }
  );
  if (found[0]?.id) return found[0].id;

  const [result] = await sequelize.query(
    `INSERT INTO REGIMEN (start, end, patient_id, disease_id)
     VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), :patientId, :diseaseId)`,
    { replacements: { patientId, diseaseId }, type: QueryTypes.INSERT, transaction }
  );
  return result;
}

async function createTreatmentForPatient({ patientId, doctorId, complaint, department, diseaseId, transaction }) {
  const regimenId = await ensureRegimen(patientId, diseaseId, transaction);
  const [treatmentId] = await sequelize.query(
    `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id)
     VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, NULL)`,
    {
      replacements: {
        complaint: complaint || 'General follow-up',
        type: department || 'General',
        regimenId,
        doctorId
      },
      type: QueryTypes.INSERT,
      transaction
    }
  );
  return treatmentId;
}

async function getLatestDiagnosisByPatientId(patientId) {
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
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
     LEFT JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
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
            type: 'PAT',
            status: 'Active'
          },
          attributes: ['username']
        }
      ],
      attributes: ['id', 'email', 'first_name', 'last_name', 'dob', 'sex', 'idcard','tel',],
      order: [['id', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // For each patient, get latest diagnosis and appointment info
    const enrichedPatients = await Promise.all(patients.map(async (patient) => {
    const p = patient.toJSON();

      const latestDiagnosis = await getLatestDiagnosisByPatientId(p.id);

      // // Get latest appointment
      // const latestAppointment = await Appointment.findOne({
      //   where: { userId: p.id },
      //   order: [['date', 'DESC'], ['time', 'DESC']]
      // });

      // Get latest health info
      const healthInfo = await HealthInfo.findOne({
        where: { patient_id: p.id },
        order: [['time', 'DESC']]
      });

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
        bmi: healthInfo ? healthInfo.bmi : null
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

    // Chỉ doctor mới được phép
    if (req.user.role !== "doctor") {
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

    // Lấy health info mới nhất
    const healthInfo = await HealthInfo.findOne({
      where: { patient_id: p.id },
      order: [['time', 'DESC']]
    });

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
      'SELECT in_department FROM PATIENT WHERE user_id = :uid LIMIT 1',
      { replacements: { uid: p.id }, type: QueryTypes.SELECT }
    );
    const deptRow = patDeptRows[0];
    const inDepartment =
      deptRow?.in_department ?? deptRow?.inDepartment ?? null;

    // HEALTH_INSURANCE.id based on PATIENT.patient_id (PATIENT.user_id = USER.id)
    let healthInsuranceId = null;
    try {
      const patRow = await Patient.findOne({
        where: { user_id: p.id },
        attributes: ['patient_id'],
      });
      const pid = patRow?.patient_id;
      if (pid) {
        const hiRows = await sequelize.query(
          'SELECT id FROM HEALTH_INSURANCE WHERE patient_id = :pid LIMIT 1',
          { replacements: { pid }, type: QueryTypes.SELECT }
        );
        healthInsuranceId = hiRows[0]?.id ?? null;
      }
    } catch (e) {
      // Don't block patient fetch if insurance lookup fails
      healthInsuranceId = null;
    }

    res.json({
      success: true,
      patient: {
        id: p.id,
        username: p.ACCOUNT?.username || "",
        firstName: p.first_name,
        lastName: p.last_name,
        gender: p.sex,
        age: calculateAge(p.dob),
        latestDiagnosis: latestDiagnosis ? {
          icd10: latestDiagnosis.icd10 || '',
          interpretation: latestDiagnosis.interpretation || '',
          department: latestDiagnosis.department || '',
          doctorName: latestDiagnosis.doctorName || ''
        } : null,
        /** PATIENT.in_department — clinical unit the patient is under */
        inDepartment: inDepartment || null,
        bmi: bmi,
        healthInsuranceId: healthInsuranceId || null,
        bloodType: healthInfo?.bloodType ?? null
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
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
    const numericPatientId = Number(String(patientId).replace(/^OP0*/, ''));

    const healthInfo = await HealthInfo.findOne({
      where: { patient_id: numericPatientId },
      order: [['time', 'DESC']]
    });

    const patient = await Patient.findByPk(patientId)

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

    console.log("RAW DATA:", healthInfo?.toJSON(), "Parsed:", {
      blood_type: patient.blood_type,
      allergic_info: parseJSON(patient.allergic_info),
      medical_history: parseJSON(patient.medical_history)
    })

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
    const numericPatientId = Number(String(patientId).replace(/^OP0*/, ''));
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: history } = await HealthInfo.findAndCountAll({
      where: { patient_id: numericPatientId },
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
    const doctorUser = req.user;

    // Verify patient exists
    const patient = await User.findOne({ where: { id: patientId, role: 'patient' } });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const healthInfo = await HealthInfo.create({
      patientId: parseInt(patientId),
      ...req.body,
      updatedBy: doctorUser.username || `Doctor #${doctorUser.userId}`
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
    const doctorUser = req.user;

    const healthInfo = await HealthInfo.findOne({
      where: { id, patientId }
    });

    if (!healthInfo) {
      return res.status(404).json({ success: false, message: 'Health info record not found' });
    }

    await healthInfo.update({
      ...req.body,
      updatedBy: doctorUser.username || `Doctor #${doctorUser.userId}`
    });

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

    const healthInfo = await HealthInfo.findOne({
      where: { id, patientId }
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
 * GET /api/doctor/patients/:patientId/diagnoses
 * Get all diagnoses for a patient
 */
exports.getDiagnoses = async (req, res) => {
  try {
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
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
       LEFT JOIN DISEASE dis ON dis.id = r.disease_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE r.patient_id = :patientId
       ORDER BY t.time DESC`,
      { replacements: { patientId: numericId }, type: QueryTypes.SELECT }
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    const doctorId = await getDoctorIdByUserId(doctorUser.userId, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    const diseaseId = await ensureDisease(icd10, interpretation, transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: numericId,
      doctorId,
      complaint,
      department,
      diseaseId,
      transaction
    });
    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: numericId,
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
    const numericId = parseRoutePatientId(req.params.patientId);
    const treatmentId = Number(req.params.id);
    if (!numericId || !Number.isFinite(treatmentId)) {
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
      `SELECT t.id, t.regimen_id, r.disease_id, r.patient_id
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE t.id = :treatmentId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { treatmentId, patientId: numericId }, type: QueryTypes.SELECT, transaction }
    );
    if (!row[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Diagnosis not found' });
    }

    const { regimen_id: regimenId, disease_id: oldDiseaseId } = row[0];
    const newDiseaseId = await ensureDisease(icd10, interpretation, transaction);

    if (Number(oldDiseaseId) !== Number(newDiseaseId)) {
      const newRegimenId = await ensureRegimen(numericId, newDiseaseId, transaction);
      await sequelize.query(
        `UPDATE TREATMENT
         SET regimen_id = :newRegimenId,
             \`condition\` = :complaint,
             type = :type
         WHERE id = :treatmentId`,
        {
          replacements: {
            newRegimenId,
            complaint: complaint.trim(),
            type: department || 'General',
            treatmentId
          },
          type: QueryTypes.UPDATE,
          transaction
        }
      );
    } else {
      await sequelize.query(
        `UPDATE TREATMENT
         SET \`condition\` = :complaint,
             type = :type
         WHERE id = :treatmentId`,
        {
          replacements: {
            complaint: complaint.trim(),
            type: department || 'General',
            treatmentId
          },
          type: QueryTypes.UPDATE,
          transaction
        }
      );
      if (interpretation != null && String(interpretation).trim() !== '') {
        await sequelize.query(
          'UPDATE DISEASE SET description = :description WHERE id = :diseaseId',
          {
            replacements: { description: String(interpretation).trim(), diseaseId: newDiseaseId },
            type: QueryTypes.UPDATE,
            transaction
          }
        );
      }
    }

    await transaction.commit();

    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: numericId,
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const rows = await sequelize.query(
      `SELECT
         rx.order_id,
         rx.time,
         rx.status AS signatureStatus,
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
       ORDER BY rx.time DESC, pd.no ASC`,
      { replacements: { patientId: numericId }, type: QueryTypes.SELECT }
    );

    const map = new Map();
    for (const row of rows) {
      const key = row.order_id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          patientId: numericId,
          doctorId: row.doctorUserId || req.user.userId,
          doctorName: row.doctorName || '',
          department: 'General',
          signatureStatus: row.signatureStatus || 'Draft',
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { department, medications } = req.body;

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    const doctorId = await getDoctorIdByUserId(doctorUser.userId, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: numericId,
      doctorId,
      complaint: 'Prescription',
      department,
      diseaseId,
      transaction
    });
    const [orderId] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    await sequelize.query(
      `INSERT INTO MEDICAL_PRESCRIPTION (order_id, duration, time, note, status)
       VALUES (:orderId, 7, NOW(), :note, 'Draft')`,
      {
        replacements: { orderId, note: department || '' },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim();
      if (!medName) continue;
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id;
      if (!medicineId) {
        const [newMedId] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = newMedId;
      }
      await sequelize.query(
        `INSERT INTO PRESCRIPTION_DETAIL (prescription_id, no, medicine_id, quantity, \`usage\`, unit, note)
         VALUES (:prescriptionId, :no, :medicineId, :quantity, :usage, :unit, :note)`,
        {
          replacements: {
            prescriptionId: orderId,
            no,
            medicineId,
            quantity: Number(med.quantity) || 1,
            usage: med.usage || 'Take as directed',
            unit: med.unit || 'tablet',
            note: med.note || null
          },
          type: QueryTypes.INSERT,
          transaction
        }
      );
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        usage: med.usage || '',
        unit: med.unit || 'tablet',
        note: med.note || ''
      });
      no += 1;
    }

    const doctorName = await resolveDoctorDisplayName(req);
    const prescription = {
      id: orderId,
      patientId: numericId,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      signatureStatus: 'Draft',
      medications: meds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    const numericId = parseRoutePatientId(req.params.patientId);
    const orderId = Number(req.params.id);
    if (!numericId || !Number.isFinite(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or prescription id' });
    }

    const { department, medications } = req.body;
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    const exists = await sequelize.query(
      `SELECT rx.order_id, rx.status AS signatureStatus
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { orderId, patientId: numericId }, type: QueryTypes.SELECT, transaction }
    );
    if (!exists[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    if (exists[0].signatureStatus !== 'Draft') {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only prescriptions in Draft status can be edited'
      });
    }

    await sequelize.query('DELETE FROM PRESCRIPTION_DETAIL WHERE prescription_id = :orderId', {
      replacements: { orderId },
      type: QueryTypes.DELETE,
      transaction
    });

    if (department !== undefined) {
      await sequelize.query(
        `UPDATE MEDICAL_PRESCRIPTION SET time = NOW(), note = :note WHERE order_id = :orderId`,
        {
          replacements: { orderId, note: department || '' },
          type: QueryTypes.UPDATE,
          transaction
        }
      );
    } else {
      await sequelize.query(
        'UPDATE MEDICAL_PRESCRIPTION SET time = NOW() WHERE order_id = :orderId',
        { replacements: { orderId }, type: QueryTypes.UPDATE, transaction }
      );
    }

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim();
      if (!medName) continue;
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id;
      if (!medicineId) {
        const [newMedId] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = newMedId;
      }
      await sequelize.query(
        `INSERT INTO PRESCRIPTION_DETAIL (prescription_id, no, medicine_id, quantity, \`usage\`, unit, note)
         VALUES (:prescriptionId, :no, :medicineId, :quantity, :usage, :unit, :note)`,
        {
          replacements: {
            prescriptionId: orderId,
            no,
            medicineId,
            quantity: Number(med.quantity) || 1,
            usage: med.usage || 'Take as directed',
            unit: med.unit || 'tablet',
            note: med.note || null
          },
          type: QueryTypes.INSERT,
          transaction
        }
      );
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        usage: med.usage || '',
        unit: med.unit || 'tablet',
        note: med.note || ''
      });
      no += 1;
    }

    if (meds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication with a name is required' });
    }

    const doctorName = await resolveDoctorDisplayName(req);
    const prescription = {
      id: orderId,
      patientId: numericId,
      doctorId: req.user.userId,
      doctorName,
      department: department || '',
      signatureStatus: 'Draft',
      medications: meds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await transaction.commit();
    res.json({ success: true, prescription });
  } catch (error) {
    await transaction.rollback();
    console.error('Update prescription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATCH /api/doctor/patients/:patientId/prescriptions/:id/sign
 * Draft → Signed
 */
exports.signPrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const numericId = parseRoutePatientId(req.params.patientId);
    const orderId = Number(req.params.id);
    if (!numericId || !Number.isFinite(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or prescription id' });
    }

    const rows = await sequelize.query(
      `SELECT rx.status AS signatureStatus
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { orderId, patientId: numericId }, type: QueryTypes.SELECT, transaction }
    );
    if (!rows[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    if (rows[0].signatureStatus !== 'Draft') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only a draft prescription can be signed'
      });
    }

    await sequelize.query(
      `UPDATE MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       SET rx.status = 'Signed', rx.time = NOW()
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId`,
      { replacements: { orderId, patientId: numericId }, type: QueryTypes.UPDATE, transaction }
    );

    await transaction.commit();
    res.json({ success: true, signatureStatus: 'Signed', id: orderId });
  } catch (error) {
    await transaction.rollback();
    console.error('Sign prescription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PATCH /api/doctor/patients/:patientId/prescriptions/:id/unsign
 * Signed → Unsigned (cannot edit after)
 */
exports.unsignPrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const numericId = parseRoutePatientId(req.params.patientId);
    const orderId = Number(req.params.id);
    if (!numericId || !Number.isFinite(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or prescription id' });
    }

    const rows = await sequelize.query(
      `SELECT rx.status AS signatureStatus
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { orderId, patientId: numericId }, type: QueryTypes.SELECT, transaction }
    );
    if (!rows[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    if (rows[0].signatureStatus !== 'Signed') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only a signed prescription can be unsigned'
      });
    }

    await sequelize.query(
      `UPDATE MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       SET rx.status = 'Unsigned', rx.time = NOW()
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId`,
      { replacements: { orderId, patientId: numericId }, type: QueryTypes.UPDATE, transaction }
    );

    await transaction.commit();
    res.json({ success: true, signatureStatus: 'Unsigned', id: orderId });
  } catch (error) {
    await transaction.rollback();
    console.error('Unsign prescription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ═══════════════════════════════════════════════
//  LAB TESTS
// ═══════════════════════════════════════════════

exports.getLabTests = async (req, res) => {
  try {
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const rows = await sequelize.query(
      `SELECT
         tst.id,
         r.patient_id AS patientId,
         tst.type AS testType,
         tst.time AS testDate,
         td.result AS resultSummary,
         p.note,
         '' AS fileUrl
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       LEFT JOIN TEST_DETAIL td ON td.test_id = tst.id AND td.no = 1
       WHERE r.patient_id = :patientId
       ORDER BY tst.time DESC`,
      { replacements: { patientId: numericId }, type: QueryTypes.SELECT }
    );
    const labTests = rows.map((r) => ({ ...r, technicianName: null }));
    res.json({ success: true, labTests });
  } catch (error) {
    console.error('Get lab tests error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createLabTest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { testType, testDate, technicianName, resultSummary, fileUrl, note } = req.body;
    if (!testType || !testDate) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'testType and testDate are required' });
    }
    const doctorId = await getDoctorIdByUserId(req.user.userId, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: numericId,
      doctorId,
      complaint: 'Laboratory test',
      department: 'Lab',
      diseaseId,
      transaction
    });
    const [orderId] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      { replacements: { status: 'active', treatmentId }, type: QueryTypes.INSERT, transaction }
    );
    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, 'TEST')`,
      { replacements: { orderId, note: note || null, doctorId }, type: QueryTypes.INSERT, transaction }
    );
    await sequelize.query(
      'INSERT INTO TEST (id, time, type) VALUES (:id, :time, :type)',
      { replacements: { id: orderId, time: testDate, type: testType }, type: QueryTypes.INSERT, transaction }
    );
    await sequelize.query(
      'INSERT INTO TEST_DETAIL (test_id, no, `index`, result) VALUES (:testId, 1, :idx, :result)',
      {
        replacements: { testId: orderId, idx: 'summary', result: resultSummary || '' },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const labTest = { id: orderId, patientId: numericId, testType, testDate, technicianName: technicianName || null, resultSummary: resultSummary || null, fileUrl: fileUrl || null, note: note || null };
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
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
      { replacements: { id, patientId: numericId }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }
    const { testType, testDate, technicianName, resultSummary, fileUrl, note } = req.body;
    if (testType !== undefined || testDate !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET type = COALESCE(:type, type), time = COALESCE(:time, time) WHERE id = :id',
        { replacements: { id, type: testType || null, time: testDate || null }, type: QueryTypes.UPDATE }
      );
    }
    if (note !== undefined) {
      await sequelize.query(
        'UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id',
        { replacements: { id, note }, type: QueryTypes.UPDATE }
      );
    }
    if (resultSummary !== undefined) {
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
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
      { replacements: { patientId: numericId }, type: QueryTypes.SELECT }
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
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
    const doctorId = await getDoctorIdByUserId(req.user.userId, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: numericId,
      doctorId,
      complaint: 'Surgery',
      department: 'Surgery',
      diseaseId,
      transaction
    });
    const [orderId] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      { replacements: { status: 'active', treatmentId }, type: QueryTypes.INSERT, transaction }
    );
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
      patientId: numericId,
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
    const numericId = parseRoutePatientId(req.params.patientId);
    if (!numericId) {
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
      { replacements: { id, patientId: numericId }, type: QueryTypes.SELECT }
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
        patientId: numericId,
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
         a.\`condition\` AS symptoms,
         '' AS notes,
         cr.name AS room,
         d.specifications AS department,
         p.user_id AS patientId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
       FROM APPOINTMENT a
       JOIN PATIENT p ON p.patient_id = a.patient_id
       JOIN USER u ON u.id = p.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       WHERE a.doctor_id = :doctorId
         AND (:startDate IS NULL OR DATE(a.time) >= :startDate)
         AND (:endDate IS NULL OR DATE(a.time) <= :endDate)
         ${statusFilter}
       ORDER BY a.time DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const appointments = rows.map((r) => ({
      id: r.id,
      userId: r.patientId,
      patientId: r.patientId,
      patientName: r.patientName,
      doctor: req.user.username || '',
      department: r.department || '',
      date: r.date,
      time: r.time,
      room: r.room || '',
      symptoms: r.symptoms || '',
      notes: r.notes || '',
      status: r.dbStatus === 'completed' ? 'Done' : r.dbStatus === 'cancelled' ? 'Cancelled' : 'Pending'
    }));

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
      `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id)
       VALUES (:dateTime, 'scheduled', :condition, :patientPk, :doctorId, :roomId, NULL)`,
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
 * PUT /api/doctor/appointments/:id/cancel
 * Cancel an appointment
 */
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const own = await sequelize.query(
      'SELECT id FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1',
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!own[0]) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    await sequelize.query(
      "UPDATE APPOINTMENT SET status = 'cancelled' WHERE id = :id",
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    res.json({ success: true, appointment: { id: Number(id), status: 'Cancelled' } });
  } catch (error) {
    console.error('Cancel appointment error:', error);
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
    const own = await sequelize.query(
      'SELECT id FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1',
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!own[0]) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    await sequelize.query(
      "UPDATE APPOINTMENT SET status = 'scheduled' WHERE id = :id",
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    res.json({ success: true, appointment: { id: Number(id), status: 'Pending' } });
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
           d.specifications AS department,
           cr.name AS room,
           p.user_id AS patientId,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
         FROM APPOINTMENT a
         JOIN PATIENT p ON p.patient_id = a.patient_id
         JOIN USER u ON u.id = p.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
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