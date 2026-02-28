const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const authenticateToken = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Middleware to check doctor role
const requireDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Doctor role required.' });
  }
  next();
};

router.use(requireDoctor);

// ─── Patients ───
router.get('/patients', doctorController.getPatients);
router.get('/patients/:patientId', doctorController.getPatient);

// ─── Health Info ───
router.get('/patients/:patientId/health-info', doctorController.getHealthInfo);
router.get('/patients/:patientId/health-info/history', doctorController.getHealthInfoHistory);
router.post('/patients/:patientId/health-info', doctorController.createHealthInfo);
router.put('/patients/:patientId/health-info/:id', doctorController.updateHealthInfo);
router.delete('/patients/:patientId/health-info/:id', doctorController.deleteHealthInfo);

// ─── Diagnoses ───
router.get('/patients/:patientId/diagnoses', doctorController.getDiagnoses);
router.post('/patients/:patientId/diagnoses', doctorController.createDiagnosis);

// ─── Prescriptions ───
router.get('/patients/:patientId/prescriptions', doctorController.getPrescriptions);
router.post('/patients/:patientId/prescriptions', doctorController.createPrescription);

// ─── Appointments ───
router.get('/appointments', doctorController.getAppointments);
router.post('/appointments', doctorController.createAppointment);
router.put('/appointments/:id/cancel', doctorController.cancelAppointment);
router.put('/appointments/:id/confirm', doctorController.confirmAppointment);

module.exports = router;
