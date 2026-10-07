const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/doctor/catalogController');
const dashboardController = require('../controllers/doctor/dashboardController');
const patientController = require('../controllers/doctor/patientController');
const regimenController = require('../controllers/doctor/regimenController');
const healthInfoController = require('../controllers/doctor/healthInfoController');
const diagnosisController = require('../controllers/doctor/diagnosisController');
const prescriptionController = require('../controllers/doctor/prescriptionController');
const labTestController = require('../controllers/doctor/labTestController');
const surgeryController = require('../controllers/doctor/surgeryController');
const doctorAppointmentController = require('../controllers/doctor/appointmentController');
const signatureController = require('../controllers/doctor/signatureController');
const authenticateToken = require('../middleware/authMiddleware');
const { requireActiveEmrVisitForDoctorTech } = require('../middleware/emrActiveVisitMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const appointmentController = require('../controllers/appointmentController');
const validateRequest = require('../middleware/validateRequest');
const { labAttachmentJsonBody } = require('../middleware/jsonBody');
const appointmentSchemas = require('../validators/appointmentSchemas');
const { aiRecoveryRateLimit } = require('../middleware/rateLimitMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Middleware to check doctor role
router.use(authorizeCapability('doctor.emr.read'));
router.use(requireActiveEmrVisitForDoctorTech);

// ─── Dictionary / master data ───
router.get('/diseases', catalogController.getDiseaseCodes);
router.get('/medicines', catalogController.getMedicines);
router.get('/technicians', catalogController.getTechnicians);
router.get('/departments', catalogController.getDepartments);

// ─── Dashboard ───
router.get('/dashboard/summary', dashboardController.getDashboardSummary);

// ─── Patients ───
const addDocumentGuard = authorizeCapability('doctor.emr.write', { message: 'Only a doctor can add this document' });
router.get('/patients', patientController.getPatients);
router.get('/patients/:patientId', patientController.getPatient);
router.get(
  '/patients/:patientId/recovery-prediction',
  validateRequest(appointmentSchemas.recoveryPredictionQuery),
  aiRecoveryRateLimit,
  appointmentController.getStaffPatientRecoveryPrediction
);
router.get('/patients/:patientId/regimen/active', regimenController.getActiveRegimenForPatient);
router.get('/patients/:patientId/regimen/active/documents', regimenController.getActiveRegimenDocumentsForPatient);
router.get('/patients/:patientId/medical-regimens', regimenController.getPatientMedicalRegimensForDoctor);
router.post(
  '/patients/:patientId/regimen/close',
  authorizeCapability('doctor.emr.write', { message: 'Only a doctor can finish the examination' }),
  regimenController.closeOpenRegimenForPatient
);
router.post('/patients/:patientId/health-tracking-slips', addDocumentGuard, regimenController.createHealthTrackingSlipForPatient);
router.post('/patients/:patientId/follow-up-reexam-slip', addDocumentGuard, regimenController.createFollowUpReexamSlipForPatient);

// ─── Health Info ───
router.get('/patients/:patientId/health-info', healthInfoController.getHealthInfo);
router.get('/patients/:patientId/health-info/history', healthInfoController.getHealthInfoHistory);
router.post('/patients/:patientId/health-info', healthInfoController.createHealthInfo);
router.put('/patients/:patientId/health-info/:id', healthInfoController.updateHealthInfo);
router.patch('/patients/:patientId/health-info/:id/confirm', healthInfoController.confirmHealthInfo);
router.delete('/patients/:patientId/health-info/:id', healthInfoController.deleteHealthInfo);

// ─── Diagnoses ───
router.get('/patients/:patientId/diagnoses', diagnosisController.getDiagnoses);
router.post('/patients/:patientId/diagnoses', diagnosisController.createDiagnosis);
router.put('/patients/:patientId/diagnoses/:id', diagnosisController.updateDiagnosis);

// ─── Prescriptions ───
router.get('/patients/:patientId/prescriptions', prescriptionController.getPrescriptions);
router.post('/patients/:patientId/prescriptions', prescriptionController.createPrescription);
router.put('/patients/:patientId/prescriptions/:id', prescriptionController.updatePrescription);
router.post('/patients/:patientId/transfers', regimenController.createPatientTransfer);

// ─── Lab tests ───
router.get('/patients/:patientId/lab-tests', labTestController.getLabTests);
router.post('/patients/:patientId/lab-tests', labTestController.createLabTest);
router.put('/patients/:patientId/lab-tests/:id', labTestController.updateLabTest);
router.get('/patients/:patientId/lab-tests/:id/details', labTestController.getLabTestDetails);
router.post('/lab-attachments', labAttachmentJsonBody, labTestController.uploadLabAttachment);

// ─── Surgeries ───
router.get('/patients/:patientId/surgeries', surgeryController.getSurgeries);
router.post('/patients/:patientId/surgeries', surgeryController.createSurgery);
router.put('/patients/:patientId/surgeries/:id', surgeryController.updateSurgery);

// ─── Appointments ───
router.get('/appointments', doctorAppointmentController.getAppointments);
router.post('/appointments', doctorAppointmentController.createAppointment);
router.put('/appointments/:id/cancel', doctorAppointmentController.cancelAppointment);
router.put('/appointments/:id/cover', doctorAppointmentController.coverAppointment);
router.put('/appointments/:id/confirm', doctorAppointmentController.confirmAppointment);
router.put('/appointments/:id/decline', doctorAppointmentController.declineAppointment);

// ─── Signature ───
router.get('/signature', signatureController.getSignature);
router.put('/signature', signatureController.saveSignature);

module.exports = router;
