const Appointment = require('../models/Appointment');
const { Op } = require('sequelize');
const sequelize = require('../common/database');
const User = sequelize.models.user || require('../models/User')(sequelize);

/**
 * GET /api/appointments/doctors
 * Return all active doctors (for patient booking)
 */
exports.getDoctors = async (req, res) => {
  try {
    const doctors = await User.findAll({
      where: { role: 'doctor', isActive: true },
      attributes: ['id', 'username', 'firstName', 'lastName', 'department'],
      order: [['department', 'ASC'], ['firstName', 'ASC']]
    });
    res.json({ success: true, doctors });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/appointments/booked-slots?date=YYYY-MM-DD
 * Return already-booked (time, doctor) pairs for a given date.
 */
exports.getBookedSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query param required' });

    const booked = await Appointment.findAll({
      where: {
        date,
        status: { [Op.in]: ['Pending', 'Confirmed'] }
      },
      attributes: ['doctor', 'time']
    });

    res.json({ success: true, slots: booked.map(b => ({ doctor: b.doctor, time: b.time })) });
  } catch (error) {
    console.error('Get booked slots error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { doctor, department, date, time, room, symptoms, notes } = req.body;

    const userId = req.user.userId; // Get userId from authenticated token
    
    // Basic validation
    if (!doctor || !department || !date || !time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Look up patient for display
    const patientUser = await User.findByPk(userId, { attributes: ['username', 'firstName', 'lastName'] });
    const patientName = patientUser 
      ? `${patientUser.firstName || ''} ${patientUser.lastName || ''}`.trim() || patientUser.username
      : String(userId);


    // Check for double booking
    const existingAppointment = await Appointment.findOne({
      where: {
        doctor,
        date,
        time,
        status: { [Op.in]: ['Pending', 'Confirmed'] }

      }
    });

    if (existingAppointment) {
      return res.status(409).json({ message: 'This time slot is already booked. Please choose another time.' });
    }

    const appointment = await Appointment.create({
      userId,
      doctor,
      patient: patientName,
      department,
      date,
      time,
      room,
      symptoms,
      notes,
      status: 'Pending'
    });

    res.status(201).json({ success: true, appointment });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const userId = req.user.userId; // Get userId from authenticated token
    
    const appointments = await Appointment.findAll({
      where: { userId },
      order: [['date', 'DESC'], ['time', 'DESC']]
    });


    // Enrich appointments with doctor full name
    const enriched = await Promise.all(appointments.map(async (appt) => {
      const a = appt.toJSON();
      
      // Find doctor by username and get full name
      if (a.doctor) {
        const doctorUser = await User.findOne({
          where: { username: a.doctor },
          attributes: ['id', 'username', 'firstName', 'lastName']
        });
        if (doctorUser) {
          a.doctorFullName = `${doctorUser.firstName || ''} ${doctorUser.lastName || ''}`.trim() || doctorUser.username;
          // Keep original doctor field for backward compatibility
          a.doctor = a.doctorFullName;
        }
      }
      
      return a;
    }));

    res.status(200).json({ success: true, appointments: enriched });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // Ensure the appointment belongs to the user
    const appointment = await Appointment.findOne({ where: { id, userId } });
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }

    await appointment.update(updates);

    res.status(200).json({ success: true, appointment });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Ensure the appointment belongs to the user
    const appointment = await Appointment.findOne({ where: { id, userId } });
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }

    await appointment.destroy();

    res.status(200).json({ success: true, message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
