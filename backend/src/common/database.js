const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('./logger');
const { config } = require('../config/env');

/** TCP MySQL (e.g. Aiven): set DB_USE_SSL=1 when the provider requires TLS on the public endpoint. */
const useTcpSsl = config.db.useSsl;
const sslRejectUnauthorized = config.db.sslRejectUnauthorized;

const resolveSslCa = () => {
  const rawPath = config.db.sslCaPath;
  if (rawPath) {
    const resolved = path.resolve(rawPath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved);
    }
    logger.warn(`[db] DB_SSL_CA_PATH not found: ${resolved}`);
  }
  const inline = config.db.sslCaInline;
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

if (!config.isProduction) {
  const sslOpts = buildTcpSslOptions();
  logger.info({
    useTcpSsl,
    sslRejectUnauthorized,
    hasSslCa: Boolean(sslOpts.ssl?.ca),
  }, '[db] connection options');
}

/** SQL text includes inlined replacement values (patient data) — only at LOG_LEVEL=debug. */
const logSql = (sql) => logger.debug({ sql }, 'db.query');

const pool = { ...config.db.pool };

const { syncMysqlClinicTimezone } = require('./clinicDate');

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  dialectOptions: buildTcpSslOptions(),
  logging: logSql,
  pool,
});

sequelize.addHook('afterConnect', async (connection) => {
  try {
    await syncMysqlClinicTimezone(connection);
  } catch (err) {
    logger.warn({ err }, '[db] clinic timezone sync skipped');
  }
});

module.exports = sequelize;
