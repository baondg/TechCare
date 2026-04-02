const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const authenticateToken = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Middleware to check doctor role
const requireDoctor = (req, res, next) => {
  if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied. Medical staff role required.' });
  }
  next();
};

router.use(requireDoctor);

// ─── Dictionary / master data ───
router.get('/diseases', doctorController.getDiseaseCodes);
router.get('/medicines', doctorController.getMedicines);

// ─── Dashboard ───
router.get('/dashboard/summary', doctorController.getDashboardSummary);

// ─── Patients ───
router.get('/patients', doctorController.getPatients);
router.get('/patients/:patientId', doctorController.getPatient);

// ─── Health Info ───
router.get('/patients/:patientId/health-info', doctorController.getHealthInfo);
router.get('/patients/:patientId/health-info/history', doctorController.getHealthInfoHistory);
router.post('/patients/:patientId/health-info', doctorController.createHealthInfo);
router.put('/patients/:patientId/health-info/:id', doctorController.updateHealthInfo);
router.patch('/patients/:patientId/health-info/:id/sign', doctorController.signHealthInfo);
router.patch('/patients/:patientId/health-info/:id/unsign', doctorController.unsignHealthInfo);
router.delete('/patients/:patientId/health-info/:id', doctorController.deleteHealthInfo);

// ─── Diagnoses ───
router.get('/patients/:patientId/diagnoses', doctorController.getDiagnoses);
router.post('/patients/:patientId/diagnoses', doctorController.createDiagnosis);
router.put('/patients/:patientId/diagnoses/:id', doctorController.updateDiagnosis);

// ─── Prescriptions ───
router.get('/patients/:patientId/prescriptions', doctorController.getPrescriptions);
router.post('/patients/:patientId/prescriptions', doctorController.createPrescription);
router.put('/patients/:patientId/prescriptions/:id', doctorController.updatePrescription);
router.patch('/patients/:patientId/prescriptions/:id/sign', doctorController.signPrescription);
router.patch('/patients/:patientId/prescriptions/:id/unsign', doctorController.unsignPrescription);

// ─── Lab tests ───
router.get('/patients/:patientId/lab-tests', doctorController.getLabTests);
router.post('/patients/:patientId/lab-tests', doctorController.createLabTest);
router.put('/patients/:patientId/lab-tests/:id', doctorController.updateLabTest);

// ─── Surgeries ───
router.get('/patients/:patientId/surgeries', doctorController.getSurgeries);
router.post('/patients/:patientId/surgeries', doctorController.createSurgery);
router.put('/patients/:patientId/surgeries/:id', doctorController.updateSurgery);

// ─── Appointments ───
router.get('/appointments', doctorController.getAppointments);
router.post('/appointments', doctorController.createAppointment);
router.put('/appointments/:id/cancel', doctorController.cancelAppointment);
router.put('/appointments/:id/confirm', doctorController.confirmAppointment);

// ─── Signature ───
router.get('/signature', doctorController.getSignature);
router.put('/signature', doctorController.saveSignature);

module.exports = router;
