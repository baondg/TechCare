const HealthInfo = require('../../models/MedicalRecord');
const Patient = require('../../models/Patient');
const { BadRequestError } = require('../../errors/AppError');
const logger = require('../../common/logger');
const { resolveCanonicalPatientIdFromEmrParam } = require('../../services/emr/patientRouteResolver');

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
        // Don't log `val`: it is patient allergy/history data.
        logger.warn({ err: e }, 'Failed to parse patient JSON column');
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
    logger.error({ err: error }, 'Get health info error');
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    logger.error({ err: error }, 'Get health info history error');
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    logger.error({ err: error }, 'Create health info error');
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    logger.error({ err: error }, 'Update health info error');
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    logger.error({ err: error }, 'Delete health info error');
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    logger.error({ err: error }, 'Confirm health info error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
