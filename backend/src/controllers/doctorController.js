const { Op } = require('sequelize');
const sequelize = require('../common/database');
const Account = require('../models/Account');
const Appointment = require('../models/Appointment');
const HealthInfo = require('../models/HealthInfo');
const Diagnosis = require('../models/Diagnosis');
const { Prescription, PrescriptionMedication } = require('../models/Prescription');

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

    const where = { role: 'patient', isActive: true };

    if (search) {
      where[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: patients } = await User.findAndCountAll({
      where,
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'age', 'gender', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // For each patient, get latest diagnosis and appointment info
    const enrichedPatients = await Promise.all(patients.map(async (patient) => {
      const p = patient.toJSON();

      // Get latest diagnosis
      const latestDiagnosis = await Diagnosis.findOne({
        where: { patientId: p.id },
        order: [['createdAt', 'DESC']]
      });

      // Get latest appointment
      const latestAppointment = await Appointment.findOne({
        where: { userId: p.id },
        order: [['date', 'DESC'], ['time', 'DESC']]
      });

      // Get latest health info
      const healthInfo = await HealthInfo.findOne({
        where: { patientId: p.id },
        order: [['updatedAt', 'DESC']]
      });

      // Resolve doctor username to full name
      let doctorFullName = null;
      if (latestAppointment && latestAppointment.doctor) {
        const doctorUser = await User.findOne({
          where: { username: latestAppointment.doctor },
          attributes: ['firstName', 'lastName', 'username']
        });
        if (doctorUser) {
          doctorFullName = `${doctorUser.firstName || ''} ${doctorUser.lastName || ''}`.trim() || doctorUser.username;
        } else {
          doctorFullName = latestAppointment.doctor;
        }
      }

      return {
        ...p,
        latestDiagnosis: latestDiagnosis ? {
          icd10: latestDiagnosis.icd10,
          interpretation: latestDiagnosis.interpretation
        } : null,
        latestVisit: latestAppointment ? latestAppointment.date : null,
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

    const patient = await User.findOne({
      where: { id: patientId, role: 'patient' },
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'age', 'gender', 'createdAt']
    });

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const p = patient.toJSON();

    // Get latest diagnosis
    const latestDiagnosis = await Diagnosis.findOne({
      where: { patientId: p.id },
      order: [['createdAt', 'DESC']]
    });

    // Get latest health info for BMI
    const healthInfo = await HealthInfo.findOne({
      where: { patientId: p.id },
      order: [['updatedAt', 'DESC']]
    });

    res.json({
      success: true,
      patient: {
        ...p,
        latestDiagnosis: latestDiagnosis ? {
          icd10: latestDiagnosis.icd10,
          interpretation: latestDiagnosis.interpretation,
          department: latestDiagnosis.department
        } : null,
        bmi: healthInfo ? healthInfo.bmi : null,
        bloodType: healthInfo ? healthInfo.bloodType : null
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

    const healthInfo = await HealthInfo.findOne({
      where: { patientId },
      order: [['updatedAt', 'DESC']]
    });

    res.json({
      success: true,
      healthInfo: healthInfo || null
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
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: history } = await HealthInfo.findAndCountAll({
      where: { patientId },
      order: [['updatedAt', 'DESC']],
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

/**
 * GET /api/doctor/patients/:patientId/diagnoses
 * Get all diagnoses for a patient
 */
exports.getDiagnoses = async (req, res) => {
  try {
    const { patientId } = req.params;

    const diagnoses = await Diagnosis.findAll({
      where: { patientId },
      order: [['createdAt', 'DESC']]
    });

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
  try {
    const { patientId } = req.params;
    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    // Look up doctor's name
    const doctor = await User.findByPk(doctorUser.userId);
    const doctorName = doctor
      ? `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()
      : `Doctor #${doctorUser.userId}`;

    const diagnosis = await Diagnosis.create({
      patientId: parseInt(patientId),
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      complaint,
      icd10,
      interpretation: interpretation || '',
      note: note || ''
    });

    res.status(201).json({ success: true, diagnosis });
  } catch (error) {
    console.error('Create diagnosis error:', error);
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
    const { patientId } = req.params;

    const prescriptions = await Prescription.findAll({
      where: { patientId },
      include: [{
        model: PrescriptionMedication,
        as: 'medications'
      }],
      order: [['createdAt', 'DESC']]
    });

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
  try {
    const { patientId } = req.params;
    const doctorUser = req.user;
    const { department, medications } = req.body;

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    // Look up doctor's name
    const doctor = await User.findByPk(doctorUser.userId);
    const doctorName = doctor
      ? `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()
      : `Doctor #${doctorUser.userId}`;

    const prescription = await Prescription.create({
      patientId: parseInt(patientId),
      doctorId: doctorUser.userId,
      doctorName,
      department: department || ''
    });

    // Create medications
    const meds = await Promise.all(medications.map(med =>
      PrescriptionMedication.create({
        prescriptionId: prescription.id,
        name: med.name,
        frequency: med.frequency || '',
        quantity: med.quantity || '',
        instruction: med.instruction || '',
        note: med.note || ''
      })
    ));

    const result = prescription.toJSON();
    result.medications = meds;

    res.status(201).json({ success: true, prescription: result });
  } catch (error) {
    console.error('Create prescription error:', error);
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
    const doctorUser = req.user;
    const doctor = await User.findByPk(doctorUser.userId);
    const doctorUsername = doctor ? doctor.username : '';

    const { status, startDate, endDate } = req.query;

    const where = { doctor: doctorUsername };

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.date = { ...(where.date || {}), [Op.gte]: startDate };
    }

    if (endDate) {
      where.date = { ...(where.date || {}), [Op.lte]: endDate };
    }

    const appointments = await Appointment.findAll({
      where,
      order: [['date', 'DESC'], ['time', 'DESC']]
    });

    // Enrich with patient name
    const enriched = await Promise.all(appointments.map(async (appt) => {
      const a = appt.toJSON();
      const patient = await User.findByPk(a.userId, {
        attributes: ['id', 'username', 'firstName', 'lastName']
      });
      return {
        ...a,
        patientName: patient
          ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.username
          : 'Unknown',
        patientId: a.userId
      };
    }));

    res.json({ success: true, appointments: enriched });
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
    const doctorUser = req.user;
    const doctor = await User.findByPk(doctorUser.userId);
    const doctorUsername = doctor ? doctor.username : '';
    const doctorFullName = doctor 
      ? `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || doctor.username
      : '';

    const { patientId, department, date, time, room, symptoms, notes } = req.body;

    if (!patientId || !department || !date || !time) {
      return res.status(400).json({ success: false, message: 'Patient, department, date and time are required' });
    }

    // Get patient info for display
    const patient = await User.findByPk(patientId, { attributes: ['username', 'firstName', 'lastName'] });
    const patientName = patient 
      ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.username
      : String(patientId);

    // Check for double booking (still using username for consistency)
    const existing = await Appointment.findOne({
      where: { doctor: doctorUsername, date, time, status: { [Op.in]: ['Pending', 'Confirmed'] } }
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    }

    const appointment = await Appointment.create({
      userId: patientId,
      doctor: doctorUsername, // Keep username for lookups
      patient: patientName, // Store full name for display
      department,
      date,
      time,
      room: room || '',
      symptoms: symptoms || '',
      notes: notes || '',
      status: 'Confirmed'
    });

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

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (appointment.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Appointment is already cancelled' });
    }

    await appointment.update({ status: 'Cancelled' });

    res.json({ success: true, appointment });
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

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    await appointment.update({ status: 'Confirmed' });

    res.json({ success: true, appointment });
  } catch (error) {
    console.error('Confirm appointment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
