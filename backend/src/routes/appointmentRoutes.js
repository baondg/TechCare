const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authenticateToken = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const appointmentSchemas = require('../validators/appointmentSchemas');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const { aiRecoveryRateLimit, appointmentRateLimit } = require('../middleware/rateLimitMiddleware');

// Public-ish routes (still require auth)
router.use(authenticateToken);

// Get available doctors (for booking page)
router.get('/doctors', appointmentController.getDoctors);
router.get('/clinic-rooms', appointmentController.getClinicRooms);
router.get('/departments', appointmentController.getDepartments);
// Every patient with their latest diagnosis: EMR staff only.
router.get('/patients', authorizeCapability('doctor.emr.read'), appointmentController.getPortalPatients);

// Get already-booked slots for a date
router.get('/booked-slots', validateRequest(appointmentSchemas.bookedSlotsQuery), appointmentController.getBookedSlots);
router.get(
  '/open-slots',
  authorizeCapability('appointments.read.open_slots'),
  validateRequest(appointmentSchemas.openSlotsQuery),
  appointmentController.getOpenSlots
);
router.post(
  '/open-slots',
  authorizeCapability('appointments.manage.open_slots'),
  validateRequest(appointmentSchemas.createOpenSlotBody),
  appointmentController.createOpenSlot
);
router.put(
  '/open-slots/:id',
  authorizeCapability('appointments.manage.open_slots'),
  validateRequest(appointmentSchemas.openSlotIdParam),
  appointmentController.updateOpenSlot
);
router.delete(
  '/open-slots/:id',
  authorizeCapability('appointments.manage.open_slots'),
  validateRequest(appointmentSchemas.openSlotIdParam),
  appointmentController.deleteOpenSlot
);

router.get(
  '/nurse/check-in-options',
  authorizeCapability('appointments.nurse.checkin'),
  validateRequest(appointmentSchemas.nurseCheckInOptionsQuery),
  appointmentController.getNurseCheckInOptions
);
router.post(
  '/nurse/check-in-accept',
  authorizeCapability('appointments.nurse.checkin'),
  validateRequest(appointmentSchemas.nurseCheckInAcceptBody),
  appointmentController.postNurseCheckInAccept
);
router.post(
  '/nurse/check-in-assign',
  authorizeCapability('appointments.nurse.checkin'),
  validateRequest(appointmentSchemas.nurseCheckInAssignBody),
  appointmentController.postNurseCheckInAssign
);
router.post(
  '/nurse/check-in-reschedule',
  authorizeCapability('appointments.nurse.checkin'),
  validateRequest(appointmentSchemas.nurseCheckInRescheduleBody),
  appointmentController.postNurseCheckInReschedule
);
router.post(
  '/nurse/regimen/checkout',
  authorizeCapability('appointments.nurse.checkin'),
  validateRequest(appointmentSchemas.nurseRegimenCheckoutBody),
  appointmentController.postNurseRegimenCheckout
);

router.get('/dashboard-summary', appointmentController.getPatientDashboardSummary);
router.get('/medical-visits', appointmentController.getPatientMedicalVisits);
router.get('/medical-regimens', appointmentController.getPatientMedicalRegimens);
router.get('/symptom-logs', appointmentController.getPatientSymptomLogs);
router.get(
  '/lab-tests/:testId/details',
  validateRequest(appointmentSchemas.labTestIdParam),
  appointmentController.getPatientLabTestDetails
);
router.get('/feedback', appointmentController.getFeedbacks);
router.get('/feedback/visible', appointmentController.getVisibleFeedbacks);
router.post('/feedback', validateRequest(appointmentSchemas.createFeedbackBody), appointmentController.createFeedback);
router.get('/ai-recommendations', appointmentController.getAiRecommendations);
router.get('/ai/models', appointmentController.getAiChatModels);
router.patch(
  '/ai-recommendations/:id/feedback',
  validateRequest(
    appointmentSchemas.compose(
      appointmentSchemas.appointmentIdParam,
      appointmentSchemas.patchAiRecommendationFeedbackBody
    )
  ),
  appointmentController.updateAiRecommendationFeedback
);
router.post('/ai/chat', validateRequest(appointmentSchemas.aiChatBody), appointmentController.chatWithAiAndSave);
router.post(
  '/ai/symptom-analysis',
  validateRequest(appointmentSchemas.aiSymptomAnalysisBody),
  appointmentController.analyzeSymptomsAndSave
);
router.get(
  '/ai/recovery-prediction',
  validateRequest(appointmentSchemas.recoveryPredictionQuery),
  aiRecoveryRateLimit,
  appointmentController.getRecoveryPrediction
);

// Create a new appointment
router.post(
  '/',
  appointmentRateLimit,
  authorizeCapability('appointments.write.self'),
  validateRequest(appointmentSchemas.createAppointmentBody),
  appointmentController.createAppointment
);

// Get all appointments for the logged-in user
router.get('/', authorizeCapability('appointments.read.self'), appointmentController.getAppointments);

// Update an appointment
router.put(
  '/:id',
  authorizeCapability('appointments.write.self'),
  validateRequest(appointmentSchemas.appointmentIdParam),
  appointmentController.updateAppointment
);

// Delete an appointment
router.delete(
  '/:id',
  authorizeCapability('appointments.write.self'),
  validateRequest(appointmentSchemas.compose(appointmentSchemas.appointmentIdParam, appointmentSchemas.deleteAppointmentBody)),
  appointmentController.deleteAppointment
);

module.exports = router;
