import dotenv from 'dotenv';
// Load environment variables FIRST — before any other imports so that
// modules which read process.env at initialisation time (e.g. routes/ai.ts)
// get the correct values from .env instead of falling back to defaults.
dotenv.config();

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import aiRoutes from './routes/ai';
const authRoutes = require('./authorization/routes');
const systemConfigRoutes = require('./routes/systemConfig');
const appointmentRoutes = require('./routes/appointmentRoutes');
const profileRoutes = require('./routes/profileRoutes');
const healthInfoRoutes = require('./routes/healthInfoRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const sessionMiddleware = require('./middleware/sessionMiddleware');
const sequelize = require('./common/database');

// Import models so they sync (order matters - define users table first)
require('./models/Appointment');
require('./models/Diagnosis');
require('./models/Prescription');
const Account = require('./models/Account');
const User = require('./models/Users');
const MedicalRecord = require('./models/MedicalRecord');
const Patient = require('./models/Patient');
const Relative = require('./models/Relative');
const HealthInsurance = require('./models/HealthInsurance');

// Define associations
Account.hasOne(User, { foreignKey: 'id', sourceKey: 'user_id' });
User.belongsTo(Account, { foreignKey: 'id', targetKey: 'user_id' });
Patient.hasOne(Relative, { foreignKey: 'patient_id', sourceKey: 'patient_id' });
Relative.belongsTo(Patient, { foreignKey: 'patient_id', targetKey: 'patient_id' });
User.hasOne(Patient, { foreignKey: 'user_id', sourceKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Patient.belongsTo(User, { foreignKey: 'user_id', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Patient.hasOne(HealthInsurance, {  foreignKey: 'patient_id',  as: 'insurance'});
HealthInsurance.belongsTo(Patient, {  foreignKey: 'patient_id',  as: 'patient'});
Patient.hasMany(MedicalRecord, { foreignKey: 'patient_id', as: 'medicalRecords' });
MedicalRecord.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });



// Initialize factory models (Session is already initialized in Session.js)
const defineSystemConfig = require('./models/SystemConfig');
defineSystemConfig(sequelize);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Session middleware for checking timeout
app.use(sessionMiddleware.checkSessionTimeout);

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/health-info', healthInfoRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);



const chatbotRoutes = require('./routes/chatbot');
app.use('/api/chatbot', chatbotRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'TechCare Backend API'
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'TechCare Backend API',
    version: '1.0.0',
      endpoints: {
      health: '/health',
      ai: '/api/ai/chat',
      auth: '/api/auth/login, /api/auth/signup',
      systemConfig: '/api/system-config'
    }
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('✅ Database connection ready');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
