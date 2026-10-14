const { config } = require('../config/env');

function getClinicTimezone() {
  return config.clinic.timezone;
}

function getClinicTzOffset() {
  return config.clinic.tzOffset;
}

function getClinicTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: getClinicTimezone() }).format(now);
}

async function syncMysqlClinicTimezone(connection) {
  const offset = getClinicTzOffset();
  if (!/^[-+]\d{2}:\d{2}$/.test(offset)) return;
  // Sequelize hands afterConnect the callback-style mysql2 connection.
  await connection.promise().query(`SET time_zone = '${offset}'`);
}

module.exports = {
  getClinicTimezone,
  getClinicTzOffset,
  getClinicTodayYmd,
  syncMysqlClinicTimezone,
};