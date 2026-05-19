const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const authenticateToken = require('../middleware/authMiddleware');
const { requireActiveEmrVisitForDoctorTech } = require('../middleware/emrActiveVisitMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const appointmentController = require('../controllers/appointmentController');
const validateRequest = require('../middleware/validateRequest');
const appointmentSchemas = require('../validators/appointmentSchemas');
const { aiRecoveryRateLimit } = require('../middleware/rateLimitMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Middleware to check doctor role
router.use(authorizeCapability('doctor.emr.read'));
router.use(requireActiveEmrVisitForDoctorTech);

// ─── Dictionary / master data ───
router.get('/diseases', doctorController.getDiseaseCodes);
router.get('/medicines', doctorController.getMedicines);
router.get('/technicians', doctorController.getTechnicians);
router.get('/departments', doctorController.getDepartments);

// ─── Dashboard ───
router.get('/dashboard/summary', doctorController.getDashboardSummary);

// ─── Patients ───
router.get('/patients', doctorController.getPatients);
router.get('/patients/:patientId', doctorController.getPatient);
router.get(
  '/patients/:patientId/recovery-prediction',
  validateRequest(appointmentSchemas.recoveryPredictionQuery),
  aiRecoveryRateLimit,
  appointmentController.getStaffPatientRecoveryPrediction
);
router.get('/patients/:patientId/regimen/active', doctorController.getActiveRegimenForPatient);
router.get('/patients/:patientId/regimen/active/documents', doctorController.getActiveRegimenDocumentsForPatient);
router.get('/patients/:patientId/medical-regimens', doctorController.getPatientMedicalRegimensForDoctor);
router.post('/patients/:patientId/regimen/close', doctorController.closeOpenRegimenForPatient);
router.post('/patients/:patientId/health-tracking-slips', doctorController.createHealthTrackingSlipForPatient);
router.post('/patients/:patientId/follow-up-reexam-slip', doctorController.createFollowUpReexamSlipForPatient);

// ─── Health Info ───
router.get('/patients/:patientId/health-info', doctorController.getHealthInfo);
router.get('/patients/:patientId/health-info/history', doctorController.getHealthInfoHistory);
router.post('/patients/:patientId/health-info', doctorController.createHealthInfo);
router.put('/patients/:patientId/health-info/:id', doctorController.updateHealthInfo);
router.patch('/patients/:patientId/health-info/:id/confirm', doctorController.confirmHealthInfo);
router.delete('/patients/:patientId/health-info/:id', doctorController.deleteHealthInfo);

// ─── Diagnoses ───
router.get('/patients/:patientId/diagnoses', doctorController.getDiagnoses);
router.post('/patients/:patientId/diagnoses', doctorController.createDiagnosis);
router.put('/patients/:patientId/diagnoses/:id', doctorController.updateDiagnosis);

// ─── Prescriptions ───
router.get('/patients/:patientId/prescriptions', doctorController.getPrescriptions);
router.post('/patients/:patientId/prescriptions', doctorController.createPrescription);
router.put('/patients/:patientId/prescriptions/:id', doctorController.updatePrescription);
router.post('/patients/:patientId/transfers', doctorController.createPatientTransfer);

// ─── Lab tests ───
router.get('/patients/:patientId/lab-tests', doctorController.getLabTests);
router.post('/patients/:patientId/lab-tests', doctorController.createLabTest);
router.put('/patients/:patientId/lab-tests/:id', doctorController.updateLabTest);
router.get('/patients/:patientId/lab-tests/:id/details', doctorController.getLabTestDetails);
router.post('/lab-attachments', doctorController.uploadLabAttachment);

// ─── Surgeries ───
router.get('/patients/:patientId/surgeries', doctorController.getSurgeries);
router.post('/patients/:patientId/surgeries', doctorController.createSurgery);
router.put('/patients/:patientId/surgeries/:id', doctorController.updateSurgery);

// ─── Appointments ───
router.get('/appointments', doctorController.getAppointments);
router.post('/appointments', doctorController.createAppointment);
router.put('/appointments/:id/cancel', doctorController.cancelAppointment);
router.put('/appointments/:id/cover', doctorController.coverAppointment);
router.put('/appointments/:id/confirm', doctorController.confirmAppointment);
router.put('/appointments/:id/decline', doctorController.declineAppointment);

// ─── Signature ───
router.get('/signature', doctorController.getSignature);
router.put('/signature', doctorController.saveSignature);

module.exports = router;
