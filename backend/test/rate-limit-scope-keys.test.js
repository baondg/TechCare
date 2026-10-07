/**
 * Which SYSTEM_CONFIGURATION keys each rate limiter reads, and that the values set there are applied.
 * AI recovery prediction has no settings of its own: it follows the admin page's "AI symptom" limit.
 */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { installFakeDb } = require('./helpers/fakeDb');

const DIST = path.join(__dirname, '..', 'dist');
const limiters = require(path.join(DIST, 'middleware', 'rateLimitMiddleware'));

const STORED = {
  rateLimitEnabled: 'true',
  rateLimitIpBased: 'true',
  aiSymptomRateLimitRequests: '2',
  aiSymptomRateLimitWindowSeconds: '60',
  loginRateLimitRequests: '3',
  loginRateLimitWindowSeconds: '60',
};

let db;
test.before(() => {
  db = installFakeDb();
});
test.after(() => db.restore());

function keysQueried() {
  return db.state.calls.filter((c) => /AS configKey, value FROM SYSTEM_CONFIGURATION/.test(c.sql || '')).map((c) => c.replacements.keys);
}

/** Calls the limiter `times` times from one IP; returns the status of each call (200 = passed on). */
async function hit(limiter, times, ip) {
  db.state.rules = [
    [/AS configKey, value FROM SYSTEM_CONFIGURATION/, (call) => call.replacements.keys.filter((k) => k in STORED).map((k) => ({ configKey: k, value: STORED[k] }))],
  ];
  const statuses = [];
  for (let i = 0; i < times; i += 1) {
    const req = { ip, path: '/limited', headers: {}, connection: {} };
    const res = {
      code: 200,
      status(c) {
        this.code = c;
        return this;
      },
      json() {
        statuses.push(this.code);
        return this;
      },
      setHeader() {},
    };
    await limiter(req, res, () => statuses.push(200));
  }
  return statuses;
}

const SCOPE_KEYS = (prefix) => ['rateLimitEnabled', 'rateLimitIpBased', `${prefix}RateLimitRequests`, `${prefix}RateLimitWindowSeconds`];

test('AI recovery prediction is limited by the "AI symptom" settings', async () => {
  db.reset();
  assert.deepEqual(await hit(limiters.aiRecoveryRateLimit, 3, '10.0.0.1'), [200, 200, 429]);
  assert.deepEqual(keysQueried()[0], SCOPE_KEYS('aiSymptom'));
});

test('each limiter reads its own scope keys', async () => {
  const cases = [
    ['aiSymptomRateLimit', 'aiSymptom', [200, 200, 429]],
    ['authLoginRateLimit', 'login', [200, 200, 200, 429]],
    ['authRegistrationRateLimit', 'registration', null],
    ['aiChatRateLimit', 'chatbot', null],
    ['appointmentRateLimit', 'appointment', null],
    ['globalRateLimit', 'global', null],
  ];
  for (const [name, prefix, expected] of cases) {
    db.reset();
    const statuses = await hit(limiters[name], expected ? expected.length : 1, `10.0.1.${prefix.length}`);
    if (expected) assert.deepEqual(statuses, expected, name);
    assert.deepEqual(keysQueried()[0], SCOPE_KEYS(prefix), name);
  }
});
