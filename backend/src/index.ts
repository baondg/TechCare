// `./app` loads .env before anything else — keep it the first import.
import app from './app';
import logger from './common/logger';
import { config, configWarnings } from './config/env';
const sequelize = require('./common/database');
const { startMedicationReminderScheduler } = require('./services/medicationReminderNotifications');
const { startAppointmentReminderScheduler } = require('./services/appointmentReminderNotifications');
const { getJwtSecret } = require('./security/jwtConfig');

const PORT = config.server.port;

// Initialize database and start server
async function startServer() {
  try {
    getJwtSecret();
    for (const warning of configWarnings()) {
      logger.warn(`[config] ${warning}`);
    }
    if (!config.isProduction) {
      logger.info({
        DB_HOST: config.db.host,
        DB_PORT: config.db.port,
        hasDB_NAME: Boolean(config.db.name),
        hasDB_USER: Boolean(config.db.user),
        hasDB_PASSWORD: Boolean(config.db.password),
        INSTANCE_CONNECTION_NAME: config.db.instanceConnectionName || null,
        NODE_ENV: config.nodeEnv ?? null,
      }, '[startup] environment');
    }
    await sequelize.authenticate();
    logger.info('Database connection ready');

    const { ensureSchemaColumns } = require('./common/ensureSchemaColumns');
    await ensureSchemaColumns(sequelize);

    if (config.server.autoSyncDb) {
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
