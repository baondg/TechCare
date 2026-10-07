// `./app` loads .env before anything else — keep it the first import.
import app from './app';
import logger from './common/logger';
const sequelize = require('./common/database');
const { startMedicationReminderScheduler } = require('./services/medicationReminderNotifications');
const { startAppointmentReminderScheduler } = require('./services/appointmentReminderNotifications');
const { getJwtSecret } = require('./security/jwtConfig');

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    getJwtSecret();
    if (process.env.NODE_ENV !== 'production') {
      logger.info({
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
      }, '[startup] environment');
    }
    await sequelize.authenticate();
    logger.info('Database connection ready');

    const { ensureDoctorSignatureColumn } = require('./common/ensureDoctorSignatureColumn');
    await ensureDoctorSignatureColumn(sequelize);

    const shouldAutoSync =
      process.env.AUTO_SYNC_DB === '1' ||
      process.env.AUTO_SYNC_DB === 'true';

    if (shouldAutoSync) {
      // Dev convenience: bootstrap only auth/session tables required for login.
      const User = require('./models/Users');
      const Account = require('./models/Account');
      const Session = require('./models/Session');
      await User.sync({ alter: true });
      await Account.sync({ alter: true });
      await Session.sync({ alter: true });
      logger.info('Core auth tables synchronized');
    }

    startMedicationReminderScheduler();
    startAppointmentReminderScheduler();

    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server listening');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

export default app;
