const { Sequelize } = require('sequelize');

// Cloud Run + Cloud SQL: set CLOUDSQL_INSTANCE_CONNECTION_NAME (or INSTANCE_CONNECTION_NAME)
// to project:region:instance and add the instance under the service "Connections" tab.
// Then mysql2 uses the /cloudsql/... socket; no MySQL on 127.0.0.1 inside the container.
const instanceConnectionName =
  process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME ||
  process.env.INSTANCE_CONNECTION_NAME ||
  process.env.CLOUD_SQL_CONNECTION_NAME;

const useCloudSqlSocket = Boolean(instanceConnectionName);

if (process.env.NODE_ENV !== 'production') {
  console.log('[db]', {
    useCloudSqlSocket,
    hasInstanceName: Boolean(instanceConnectionName),
  });
}

const pool = {
  max: Number(process.env.DB_POOL_MAX || 30),
  min: Number(process.env.DB_POOL_MIN || 0),
  acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 60000),
  idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
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
