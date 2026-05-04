const { Sequelize } = require('sequelize');

// Cloud Run + Cloud SQL: set CLOUDSQL_INSTANCE_CONNECTION_NAME (or INSTANCE_CONNECTION_NAME)
// to project:region:instance and add the instance under the service "Connections" tab.
// Then mysql2 uses the /cloudsql/... socket; no MySQL on 127.0.0.1 inside the container.
const instanceConnectionName =
  process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME ||
  process.env.INSTANCE_CONNECTION_NAME ||
  process.env.CLOUD_SQL_CONNECTION_NAME;

const useCloudSqlSocket = Boolean(instanceConnectionName);

// #region agent log
const _dbMode = {
  sessionId: 'd2aca7',
  location: 'common/database.js',
  message: 'sequelize connection mode',
  data: {
    useCloudSqlSocket,
    hasInstanceName: Boolean(instanceConnectionName),
  },
  timestamp: Date.now(),
  hypothesisId: 'H2',
  runId: 'pre-fix',
};
console.log('[agent-debug]', JSON.stringify(_dbMode));
fetch('http://127.0.0.1:7816/ingest/bfda5655-bb87-4a1e-8325-a85828e5c434', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd2aca7' },
  body: JSON.stringify(_dbMode),
}).catch(() => {});
// #endregion

const pool = {
  max: 5,
  min: 0,
  acquire: 30000,
  idle: 10000,
};

const sequelize = useCloudSqlSocket
  ? new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
      dialect: 'mysql',
      dialectOptions: {
        socketPath: `/cloudsql/${instanceConnectionName}`,
      },
      logging: console.log,
      pool,
    })
  : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      dialect: 'mysql',
      logging: console.log,
      pool,
    });

module.exports = sequelize;
