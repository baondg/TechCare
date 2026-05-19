const appointmentPatientService = require('../services/appointmentPatientService');
const appointmentPatientPortalService = require('../services/appointmentPatientPortalService');
const appointmentSlotService = require('../services/appointmentSlotService');
const appointmentNurseService = require('../services/appointmentNurseService');
const appointmentCatalogService = require('../services/appointmentCatalogService');
const appointmentFeedbackService = require('../services/appointmentFeedbackService');
const appointmentAiService = require('../services/appointmentAiService');

exports.getFeedbacks = async (req, res) => {
  try {
    const result = await appointmentFeedbackService.listForUser(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get feedbacks error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getVisibleFeedbacks = async (req, res) => {
  try {
    const result = await appointmentFeedbackService.listVisible();
    return res.json(result);
  } catch (error) {
    console.error('Get visible feedbacks error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.createFeedback = async (req, res) => {
  try {
    const out = await appointmentFeedbackService.create({ userId: req.user.userId, body: req.body });
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Create feedback error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPortalPatients = async (req, res) => {
  try {
    const result = await appointmentPatientPortalService.getPortalPatients();
    return res.json(result);
  } catch (error) {
    console.error('Get portal patients error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getAiRecommendations = async (req, res) => {
  try {
    const result = await appointmentAiService.getAiRecommendations(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get AI recommendations error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAiRecommendationFeedback = async (req, res) => {
  try {
    const out = await appointmentAiService.patchAiRecommendationFeedback(
      req.user.userId,
      req.params.id,
      req.body
    );
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Update AI recommendation feedback error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.chatWithAiAndSave = async (req, res) => {
  try {
    const out = await appointmentAiService.chatWithAiAndSave(req, req.user.userId, req.body);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('chatWithAiAndSave error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getAiChatModels = async (req, res) => {
  try {
    const out = await appointmentAiService.listAiChatModels();
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('getAiChatModels error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.analyzeSymptomsAndSave = async (req, res) => {
  try {
    const out = await appointmentAiService.analyzeSymptomsAndSave(req, req.user.userId, req.body);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('analyzeSymptomsAndSave error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getRecoveryPrediction = async (req, res) => {
  try {
    const patientId = await appointmentPatientService.getPatientPkForUserId(req.user.userId);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }
    const refresh =
      String(req.query?.refresh || '') === '1' || String(req.query?.refresh || '').toLowerCase() === 'true';
    const out = await appointmentAiService.recoveryPredictionForPatient(req, patientId, refresh);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('getRecoveryPrediction error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/** GET for doctor/nurse/admin/technician EMR — same payload as patient /ai/recovery-prediction. */
exports.getStaffPatientRecoveryPrediction = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['doctor', 'nurse', 'admin', 'technician'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const routeId = Number(String(req.params.patientId || '').replace(/^OP0*/i, ''));
    if (!Number.isFinite(routeId) || routeId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const patientId = await appointmentPatientService.getPatientPkFromRouteId(routeId);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    const refresh =
      String(req.query?.refresh || '') === '1' || String(req.query?.refresh || '').toLowerCase() === 'true';
    const out = await appointmentAiService.recoveryPredictionForPatient(req, patientId, refresh);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('getStaffPatientRecoveryPrediction error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/doctors
 * Return all doctors for booking / nurse slot UI.
 * Departments come from DOCTOR_DEPARTMENT → DEPARTMENT.name (schema no longer has DOCTOR.department).
 */
exports.getDoctors = async (req, res) => {
  try {
    const result = await appointmentCatalogService.getDoctors();
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/appointments/clinic-rooms
 */
exports.getClinicRooms = async (_req, res) => {
  try {
    const result = await appointmentCatalogService.getClinicRooms();
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get clinic rooms error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/departments
 */
exports.getDepartments = async (_req, res) => {
  try {
    const result = await appointmentCatalogService.getDepartments();
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get departments error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/booked-slots?date=YYYY-MM-DD
 * Return already-booked (time, doctor) pairs for a given date.
 */
exports.getBookedSlots = async (req, res) => {
  try {
    const result = await appointmentSlotService.getBookedSlots({ date: req.query.date });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get booked slots error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/appointments/open-slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Nurse view: appointment slots (both open/booked) within date range.
 */
exports.getOpenSlots = async (req, res) => {
  try {
    const result = await appointmentSlotService.getOpenSlots({
      role: req.user.role,
      query: req.query,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get open slots error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/open-slots
 * Nurse creates open appointment slot.
 */
exports.createOpenSlot = async (req, res) => {
  try {
    const result = await appointmentSlotService.createOpenSlot({
      role: req.user.role,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Create open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/appointments/open-slots/:id
 * Nurse updates slot time/room; may reassign doctor (including booked slots — same department only).
 */
exports.updateOpenSlot = async (req, res) => {
  try {
    const result = await appointmentSlotService.updateOpenSlot({
      role: req.user.role,
      id: req.params.id,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Update open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * DELETE /api/appointments/open-slots/:id
 * Nurse cancels an open slot.
 */
exports.deleteOpenSlot = async (req, res) => {
  try {
    const result = await appointmentSlotService.deleteOpenSlot({
      role: req.user.role,
      id: req.params.id,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Delete open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const result = await appointmentPatientService.createAppointment({
      userId: req.user.userId,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const result = await appointmentPatientService.getAppointmentsForUser(req.user.userId);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientDashboardSummary = async (req, res) => {
  try {
    const result = await appointmentPatientPortalService.getPatientDashboardSummary(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get patient dashboard summary error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientMedicalVisits = async (req, res) => {
  try {
    const result = await appointmentPatientPortalService.getPatientMedicalVisits(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get patient medical visits error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientMedicalRegimens = async (req, res) => {
  try {
    const result = await appointmentPatientPortalService.getPatientMedicalRegimens(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get patient medical regimens error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientSymptomLogs = async (req, res) => {
  try {
    const result = await appointmentPatientPortalService.getPatientSymptomLogs(req.user.userId);
    return res.json(result);
  } catch (error) {
    console.error('Get patient symptom logs error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientLabTestDetails = async (req, res) => {
  try {
    const { status, json } = await appointmentPatientPortalService.getPatientLabTestDetails(
      req.user.userId,
      req.params.testId
    );
    return res.status(status).json(json);
  } catch (error) {
    console.error('Get patient lab test details error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const result = await appointmentPatientService.updatePatientAppointment({
      userId: req.user.userId,
      id: req.params.id,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const result = await appointmentPatientService.deletePatientAppointment({
      userId: req.user.userId,
      id: req.params.id,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/nurse/check-in-options?patientId=OP00000001|1
 */
exports.getNurseCheckInOptions = async (req, res) => {
  try {
    const result = await appointmentNurseService.getNurseCheckInOptions({
      role: req.user.role,
      query: req.query,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Nurse check-in options error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-accept
 */
exports.postNurseCheckInAccept = async (req, res) => {
  try {
    const result = await appointmentNurseService.postNurseCheckInAccept({
      role: req.user.role,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Nurse check-in accept error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-assign
 */
exports.postNurseCheckInAssign = async (req, res) => {
  try {
    const result = await appointmentNurseService.postNurseCheckInAssign({
      role: req.user.role,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Nurse check-in assign error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-reschedule
 */
exports.postNurseCheckInReschedule = async (req, res) => {
  try {
    const result = await appointmentNurseService.postNurseCheckInReschedule({
      role: req.user.role,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Nurse check-in reschedule error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/regimen/checkout
 * Legacy/admin; doctor close is on doctor routes.
 */
exports.postNurseRegimenCheckout = async (req, res) => {
  try {
    const result = await appointmentNurseService.postNurseRegimenCheckout({
      role: req.user.role,
      body: req.body,
    });
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('Nurse regimen checkout error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
