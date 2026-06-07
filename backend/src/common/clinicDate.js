const DEFAULT_CLINIC_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_CLINIC_TZ_OFFSET = "+07:00";

function getClinicTimezone() {
  const tz = String(process.env.CLINIC_TIMEZONE || DEFAULT_CLINIC_TIMEZONE).trim();
  return tz || DEFAULT_CLINIC_TIMEZONE;
}

function getClinicTzOffset() {
  const off = String(process.env.CLINIC_TZ_OFFSET || DEFAULT_CLINIC_TZ_OFFSET).trim();
  return off || DEFAULT_CLINIC_TZ_OFFSET;
}

function getClinicTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: getClinicTimezone() }).format(now);
}

async function syncMysqlClinicTimezone(connection) {
  const offset = getClinicTzOffset();
  if (!/^[-+]\d{2}:\d{2}$/.test(offset)) return;
  await connection.query(`SET time_zone = '${offset}'`);
}

module.exports = {
  getClinicTimezone,
  getClinicTzOffset,
  getClinicTodayYmd,
  syncMysqlClinicTimezone,
};