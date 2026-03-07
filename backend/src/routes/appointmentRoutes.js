const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authenticateToken = require('../middleware/authMiddleware');

// Public-ish routes (still require auth)
router.use(authenticateToken);

// Get available doctors (for booking page)
router.get('/doctors', appointmentController.getDoctors);

// Get already-booked slots for a date
router.get('/booked-slots', appointmentController.getBookedSlots);

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
