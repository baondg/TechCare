const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authenticateToken = require('../middleware/authMiddleware');

// Public-ish routes (still require auth)
router.use(authenticateToken);

// Get available doctors (for booking page)
router.get('/doctors', appointmentController.getDoctors);
router.get('/clinic-rooms', appointmentController.getClinicRooms);
router.get('/patients', appointmentController.getPortalPatients);

// Get already-booked slots for a date
router.get('/booked-slots', appointmentController.getBookedSlots);
router.get('/open-slots', appointmentController.getOpenSlots);
router.post('/open-slots', appointmentController.createOpenSlot);
router.put('/open-slots/:id', appointmentController.updateOpenSlot);
router.delete('/open-slots/:id', appointmentController.deleteOpenSlot);

router.get('/nurse/check-in-options', appointmentController.getNurseCheckInOptions);
router.post('/nurse/check-in-accept', appointmentController.postNurseCheckInAccept);
router.post('/nurse/check-in-assign', appointmentController.postNurseCheckInAssign);
router.post('/nurse/check-in-reschedule', appointmentController.postNurseCheckInReschedule);
router.post('/nurse/regimen/checkout', appointmentController.postNurseRegimenCheckout);

router.get('/dashboard-summary', appointmentController.getPatientDashboardSummary);
router.get('/medical-visits', appointmentController.getPatientMedicalVisits);
router.get('/medical-regimens', appointmentController.getPatientMedicalRegimens);
router.get('/symptom-logs', appointmentController.getPatientSymptomLogs);
router.get('/lab-tests/:testId/details', appointmentController.getPatientLabTestDetails);
router.get('/feedback', appointmentController.getFeedbacks);
router.get('/feedback/visible', appointmentController.getVisibleFeedbacks);
router.post('/feedback', appointmentController.createFeedback);
router.get('/ai-recommendations', appointmentController.getAiRecommendations);
router.get('/ai/models', appointmentController.getAiChatModels);
router.patch('/ai-recommendations/:id/feedback', appointmentController.updateAiRecommendationFeedback);
router.post('/ai/chat', appointmentController.chatWithAiAndSave);
router.post('/ai/symptom-analysis', appointmentController.analyzeSymptomsAndSave);

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Create a new appointment
router.post('/', appointmentController.createAppointment);

// Get all appointments for the logged-in user
router.get('/', appointmentController.getAppointments);

// Update an appointment
router.put('/:id', appointmentController.updateAppointment);

// Delete an appointment
router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
