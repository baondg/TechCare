/**
 * src/config/env parses process.env once at import time, so each case loads it in a
 * fresh child process with a controlled environment. cwd is a temp dir so a developer's
 * backend/.env (picked up by dotenv) cannot leak into the assertions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const ENV_MODULE = path.join(__dirname, '..', 'dist', 'config', 'env.js');
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

/** Loads the config with `env` and returns { ok, config, warnings } or { ok:false, error }. */
function loadConfig(env) {
  const script = `
    try {
      const m = require(${JSON.stringify(ENV_MODULE)});
      process.stdout.write(JSON.stringify({ ok: true, config: m.config, warnings: m.configWarnings() }));
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
    }`;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test('defaults with an empty environment', () => {
  const { ok, config } = loadConfig({});
  assert.equal(ok, true);
  assert.equal(config.server.port, 3000);
  assert.deepEqual(config.server.corsAllowedOrigins, []);
  assert.equal(config.db.host, 'localhost');
  assert.equal(config.db.port, 3306);
  assert.deepEqual(config.db.pool, { max: 30, min: 0, acquire: 60000, idle: 10000 });
  assert.equal(config.reminders.appointmentHour, 8);
  assert.equal(config.clinic.timezone, 'Asia/Ho_Chi_Minh');
  assert.equal(config.byt.facilityCode, 'TC001');
  assert.equal(config.ai.endpoints.chat, 'http://127.0.0.1:3000/api/ai/chat');
  assert.equal(config.isProduction, false);
});

test('values are parsed with their historical semantics', () => {
  const { config } = loadConfig({
    PORT: '8080',
    CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example ,',
    AUTO_SYNC_DB: 'true',
    DB_USE_SSL: 'yes',
    ENABLE_PATIENT_RECORD_CACHE: 'true', // only '1' enables it
    AUTH_REFRESH_COOKIE_SECURE: 'FALSE',
    BYT_PRESCRIPTION_TYPE: ' h ',
    BYT_FACILITY_CODE: 'ab-12',
    GLOBAL_RATE_LIMIT_MAX: '500',
    AI_PROVIDER_SYMPTOM_ANALYSIS: 'Groq',
  });
  assert.equal(config.server.port, 8080);
  assert.deepEqual(config.server.corsAllowedOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(config.server.autoSyncDb, true);
  assert.equal(config.db.useSsl, true);
  assert.equal(config.cache.patientRecordRedisEnabled, false);
  assert.equal(config.auth.refreshCookieSecure, false);
  assert.equal(config.byt.prescriptionType, 'H');
  assert.equal(config.byt.facilityCode, 'AB120');
  assert.equal(config.rateLimit.maxOverrides.global, '500');
  assert.equal(config.ai.providerOverrides.symptom_analysis, 'Groq');
  assert.equal(config.ai.endpoints.symptom, 'http://127.0.0.1:8080/api/ai/symptom-analysis');
});

test('invalid values fail fast with every problem listed', () => {
  const { ok, error } = loadConfig({ DB_PORT: 'abc', APPOINTMENT_REMINDER_HOUR: '25', LOG_LEVEL: 'loud' });
  assert.equal(ok, false);
  assert.match(error, /DB_PORT must be a number/);
  assert.match(error, /APPOINTMENT_REMINDER_HOUR must be <= 23/);
  assert.match(error, /LOG_LEVEL/);
});

test('IMAGE_ENCRYPTION_KEY must decode to 32 bytes when set', () => {
  assert.equal(loadConfig({ IMAGE_ENCRYPTION_KEY: 'c2hvcnQ=' }).ok, false);
  assert.equal(loadConfig({ IMAGE_ENCRYPTION_KEY: VALID_KEY }).ok, true);
});

test('production requires JWT_SECRET, DB_NAME and DB_USER', () => {
  const { ok, error } = loadConfig({ NODE_ENV: 'production' });
  assert.equal(ok, false);
  for (const key of ['JWT_SECRET', 'DB_NAME', 'DB_USER']) assert.match(error, new RegExp(key));

  const prod = { NODE_ENV: 'production', JWT_SECRET: 's', DB_NAME: 'techcare', DB_USER: 'app' };
  assert.equal(loadConfig(prod).ok, true);
});

test('production warns about weak-but-tolerated settings', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: 's', DB_NAME: 'techcare', DB_USER: 'app' };
  const { warnings } = loadConfig({ ...base, BENCHMARK_RATE_LIMIT_BYPASS: '1' });
  assert.equal(warnings.length, 4);
  assert.ok(warnings.some((w) => w.includes('DEFAULT_ACCOUNT_PASSWORD')));
  assert.ok(warnings.some((w) => w.includes('BENCHMARK_RATE_LIMIT_BYPASS')));

  const hardened = loadConfig({
    ...base,
    IMAGE_ENCRYPTION_KEY: VALID_KEY,
    INTERNAL_API_SECRET: 'x',
    DEFAULT_ACCOUNT_PASSWORD: 'y',
  });
  assert.deepEqual(hardened.warnings, []);
  const demoPassword = loadConfig({ ...base, IMAGE_ENCRYPTION_KEY: VALID_KEY, INTERNAL_API_SECRET: 'x', DEFAULT_ACCOUNT_PASSWORD: 'Test@1234' });
  assert.equal(demoPassword.warnings.length, 1);
  assert.match(demoPassword.warnings[0], /DEFAULT_ACCOUNT_PASSWORD/);
  assert.deepEqual(loadConfig({}).warnings, []);
});
