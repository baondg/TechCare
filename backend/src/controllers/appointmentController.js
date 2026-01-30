const Appointment = require('../models/Appointment');

exports.createAppointment = async (req, res) => {
  try {
    const { doctor, department, date, time, room, symptoms, notes } = req.body;
    const userId = req.user.userId; // Get userId from authenticated token
    
    // Basic validation
    if (!doctor || !department || !date || !time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check for double booking
    const existingAppointment = await Appointment.findOne({
      where: {
        doctor,
        date,
        time,
        status: 'Upcoming' // Only check active appointments
      }
    });

    if (existingAppointment) {
      return res.status(409).json({ message: 'This time slot is already booked. Please choose another time.' });
    }

    const appointment = await Appointment.create({
      userId,
      doctor,
      department,
      date,
      time,
      room,
      symptoms,
      notes,
      status: 'Upcoming'
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

    res.status(200).json({ success: true, appointments });
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
