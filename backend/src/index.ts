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
const workShiftRoutes = require('./routes/workShiftRoutes');
const sessionMiddleware = require('./middleware/sessionMiddleware');
const { globalRateLimit, appointmentRateLimit } = require('./middleware/rateLimitMiddleware');
const sequelize = require('./common/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMedicationReminderScheduler } = require('./services/medicationReminderNotifications');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startAppointmentReminderScheduler } = require('./services/appointmentReminderNotifications');
const { getJwtSecret } = require('./security/jwtConfig');

/* Sequelize — one entry point for model wiring (see models/associate.js + database_description.sql). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applySequelizeAssociations } = require('./models/associate');
applySequelizeAssociations();

/** Factory model (callable with sequelize instance). */
const defineSystemConfig = require('./models/SystemConfig');
defineSystemConfig(sequelize);

const app: Express = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = allowedOrigins.includes('*');

// Middleware
app.set('trust proxy', 1);
app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin: allowAnyOrigin ? true : allowedOrigins,
          credentials: !allowAnyOrigin,
        }
      : undefined
  )
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Session middleware for checking timeout
app.use(sessionMiddleware.checkSessionTimeout);
app.use('/api', globalRateLimit);

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/appointments', appointmentRateLimit, appointmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/health-info', healthInfoRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/work-shifts', workShiftRoutes);



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
    getJwtSecret();
    if (process.env.NODE_ENV !== 'production') {
      console.log('[startup]', {
        DB_HOST: process.env.DB_HOST ?? null,
        DB_PORT: process.env.DB_PORT ?? null,
        hasDB_NAME: Boolean(process.env.DB_NAME),
        hasDB_USER: Boolean(process.env.DB_USER),
        hasDB_PASSWORD: Boolean(process.env.DB_PASSWORD),
        INSTANCE_CONNECTION_NAME:
          process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME ??
          process.env.INSTANCE_CONNECTION_NAME ??
          null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      });
    }
    await sequelize.authenticate();
    console.log('✅ Database connection ready');

    const shouldAutoSync =
      process.env.AUTO_SYNC_DB === '1' ||
      process.env.AUTO_SYNC_DB === 'true';

    if (shouldAutoSync) {
      // Dev convenience: bootstrap only auth/session tables required for login.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const User = require('./models/Users');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Account = require('./models/Account');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Session = require('./models/Session');
      await User.sync({ alter: true });
      await Account.sync({ alter: true });
      await Session.sync({ alter: true });
      console.log('✅ Core auth tables synchronized');
    }

    startMedicationReminderScheduler(sequelize);
    startAppointmentReminderScheduler(sequelize);

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
