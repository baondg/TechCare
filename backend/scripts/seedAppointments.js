const sequelize = require('../src/common/database');
const defineUser = require('../src/models/User');
const Appointment = require('../src/models/Appointment');

const User = defineUser(sequelize);

async function seedAppointments() {
  try {
    await sequelize.sync({ alter: true }); // Ensure tables exist and match model

    // Find or create a test user
    let user = await User.findOne({ where: { email: 'test@example.com' } });
    if (!user) {
      console.log('Creating test user...');
      user = await User.create({
        username: 'Test User',
        email: 'test@example.com',
        password: 'password123', // In a real app, this should be hashed
        firstName: 'Test',
        lastName: 'User',
        role: 'patient'
      });
    }

    console.log(`Seeding appointments for user: ${user.username} (${user.id})`);

    const appointments = [
      {
        userId: user.id,
        doctor: 'Dr. Sarah Wilson',
        department: 'Cardiology',
        date: '2024-03-20',
        time: '09:00:00',
        status: 'Upcoming',
        room: '302',
        symptoms: 'Chest pain, shortness of breath',
        notes: 'Follow-up checkup'
      },
      {
        userId: user.id,
        doctor: 'Dr. Michael Chen',
        department: 'Dermatology',
        date: '2024-03-22',
        time: '14:30:00',
        status: 'Upcoming',
        room: '205',
        symptoms: 'Skin rash',
        notes: 'First visit'
      },
      {
        userId: user.id,
        doctor: 'Dr. Emily Brown',
        department: 'General Medicine',
        date: '2024-03-15',
        time: '10:00:00',
        status: 'Done',
        room: '101',
        symptoms: 'Fever, headache',
        notes: 'Prescribed antibiotics'
      },
      {
        userId: user.id,
        doctor: 'Dr. James Lee',
        department: 'Orthopedics',
        date: '2024-03-10',
        time: '11:15:00',
        status: 'Cancelled',
        room: '404',
        symptoms: 'Knee pain',
        notes: 'Patient rescheduled'
      }
    ];

    for (const appt of appointments) {
      await Appointment.create(appt);
    }

    console.log('✅ Sample appointments seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding appointments:', error);
    process.exit(1);
  }
}

seedAppointments();
