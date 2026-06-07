const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

// Cloud Run + Cloud SQL: set CLOUDSQL_INSTANCE_CONNECTION_NAME (or INSTANCE_CONNECTION_NAME)
// to project:region:instance and add the instance under the service "Connections" tab.
// Then mysql2 uses the /cloudsql/... socket; no MySQL on 127.0.0.1 inside the container.
const instanceConnectionName =
  process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME ||
  process.env.INSTANCE_CONNECTION_NAME ||
  process.env.CLOUD_SQL_CONNECTION_NAME;

const useCloudSqlSocket = Boolean(instanceConnectionName);

/** TCP MySQL (e.g. Aiven): set DB_USE_SSL=1 when the provider requires TLS on the public endpoint. */
const parseBool = (v, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
};
const useTcpSsl = !useCloudSqlSocket && parseBool(process.env.DB_USE_SSL, false);
const sslRejectUnauthorized = parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true);

const resolveSslCa = () => {
  const rawPath = process.env.DB_SSL_CA_PATH || process.env.DB_SSL_CA_FILE;
  if (rawPath) {
    const resolved = path.resolve(rawPath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved);
    }
    console.warn(`[db] DB_SSL_CA_PATH not found: ${resolved}`);
  }
  const inline = process.env.DB_SSL_CA;
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }
  return undefined;
};

const buildTcpSslOptions = () => {
  if (!useTcpSsl) return {};
  const ca = resolveSslCa();
  const ssl = {
    rejectUnauthorized: sslRejectUnauthorized,
  };
  if (ca) ssl.ca = ca;
  return { ssl };
};

if (process.env.NODE_ENV !== 'production') {
  const sslOpts = buildTcpSslOptions();
  console.log('[db]', {
    useCloudSqlSocket,
    hasInstanceName: Boolean(instanceConnectionName),
    useTcpSsl,
    sslRejectUnauthorized,
    hasSslCa: Boolean(sslOpts.ssl?.ca),
  });
}

const pool = {
  max: Number(process.env.DB_POOL_MAX || 30),
  min: Number(process.env.DB_POOL_MIN || 0),
  acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 60000),
  idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
};

const { syncMysqlClinicTimezone } = require('./clinicDate');

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
      dialectOptions: buildTcpSslOptions(),
      logging: console.log,
      pool,
    });

sequelize.addHook('afterConnect', async (connection) => {
  try {
    await syncMysqlClinicTimezone(connection);
  } catch (err) {
    console.warn('[db] clinic timezone sync skipped:', err?.message || err);
  }
});

module.exports = sequelize;
