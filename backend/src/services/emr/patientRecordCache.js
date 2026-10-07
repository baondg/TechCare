const cacheService = require('../../services/cacheService');
const logger = require('../../common/logger');
const { config } = require('../../config/env');

// Hotpath cache: tuned for NFR load runs; override via env if needed.
const PATIENT_RECORD_CACHE_TTL_SECONDS = config.cache.patientRecordTtlSeconds;

const patientRecordCacheKey = (patientPk) => `doctor:patient_record:v2:${Number(patientPk)}`;

async function invalidatePatientRecordCache(patientPk) {
  const n = Number(patientPk);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    await cacheService.del(patientRecordCacheKey(n));
  } catch (e) {
    logger.warn({ err: e }, '[cache] failed to invalidate patient record cache');
  }
}

module.exports = {
  PATIENT_RECORD_CACHE_TTL_SECONDS,
  invalidatePatientRecordCache,
};
