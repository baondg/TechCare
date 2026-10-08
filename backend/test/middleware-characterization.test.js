/**
 * Characterization of the DB-backed middleware: authMiddleware (access token → session → account),
 * sessionMiddleware (concurrent-user cap) and the rate limiter's policy loading
 * (key/value rows, legacy SYSTEM_CONFIGURATION columns, missing table, DB failure).
 *
 * Each middleware is called directly with a fake req / res. Recorded per scenario: SQL (fake DB),
 * Session / Account model calls, writes on the session instance, the answer (status + body or
 * `next`), and what the middleware attached to `req` / the headers it set. Snapshot captured
 * before the middleware moved onto repositories (G3 step B).
 */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { startTestServer } = require('./helpers/app');
const { installFakeDb, accessToken, refreshToken } = require('./helpers/fakeDb');
const { legacySchemaError, dbError } = require('./helpers/characterize');

const DIST = path.join(__dirname, '..', 'dist');
const SNAPSHOT = path.join(__dirname, 'fixtures', 'middleware.snapshot.json');

const Session = require(path.join(DIST, 'models', 'Session'));
const Account = require(path.join(DIST, 'models', 'Account'));
const { getJwtSecret } = require(path.join(DIST, 'security', 'jwtConfig'));
const authenticateToken = require(path.join(DIST, 'middleware', 'authMiddleware'));
const sessionMiddleware = require(path.join(DIST, 'middleware', 'sessionMiddleware'));

const RATE_LIMIT_MODULE = path.join(DIST, 'middleware', 'rateLimitMiddleware');
const HOUR = 3600_000;

/** Fresh rate limiter module per scenario: its policy cache and counters are module state. */
function freshLimiters() {
  delete require.cache[require.resolve(RATE_LIMIT_MODULE)];
  return require(RATE_LIMIT_MODULE);
}

let db;
const originalModels = {};
const MODEL_METHODS = [
  [Session, 'Session', ['findOne', 'count', 'destroy']],
  [Account, 'Account', ['findOne']],
];

test.before(() => {
  db = installFakeDb();
  // Replace the fake DB's silent authMiddleware stubs with recording ones answered per scenario.
  for (const [model, name, methods] of MODEL_METHODS) {
    for (const method of methods) {
      const key = `${name}.${method}`;
      originalModels[key] = model[method];
      model[method] = async (opts) => {
        db.state.calls.push({ event: key, where: describeWhere(opts?.where) });
        const handler = db.state.models[key];
        const value = handler ? handler(opts) : null;
        if (value instanceof Error) throw value;
        return value;
      };
    }
  }
});

test.after(() => {
  for (const [model, name, methods] of MODEL_METHODS) {
    for (const method of methods) model[method] = originalModels[`${name}.${method}`];
  }
  db.restore();
});

function describeWhere(where) {
  if (!where) return null;
  const out = {};
  for (const key of Reflect.ownKeys(where)) {
    const value = where[key];
    const name = typeof key === 'symbol' ? `[${key.description}]` : key;
    if (value && typeof value === 'object' && !(value instanceof Date)) out[name] = describeWhere(value);
    else if (value instanceof Date) out[name] = '<date>';
    else if (typeof value === 'string' && /^eyJ/.test(value)) out[name] = '<jwt>';
    else out[name] = value;
  }
  return out;
}

/** A Session row; update() and save() both persist `lastActivity` and are recorded as such. */
function sessionRow(overrides = {}) {
  const row = { id: 7, userId: 42, expiresAt: new Date(Date.now() + HOUR), ...overrides };
  row.update = async (changes) => {
    db.state.calls.push({ event: 'Session#persist', id: row.id, fields: Object.keys(changes) });
    Object.assign(row, changes);
  };
  row.save = async () => {
    db.state.calls.push({ event: 'Session#persist', id: row.id, fields: ['lastActivity'] });
  };
  return row;
}

const activeAccount = { status: 1, getDataValue: () => 1 };

/** Runs one middleware call; returns { answer, req fields, headers }. */
async function run(middleware, { headers = {}, query = {}, body, ip = '10.0.0.1', reqPath = '/x' } = {}) {
  const req = { headers, query, body, ip, path: reqPath, connection: {} };
  const out = { headers: {} };
  await new Promise((resolve) => {
    const res = {
      code: 200,
      status(c) {
        this.code = c;
        return this;
      },
      json(payload) {
        out.answer = { status: this.code, body: payload };
        resolve();
        return this;
      },
      setHeader(name, value) {
        out.headers[name] = name === 'X-RateLimit-Reset' ? '<date>' : value;
      },
    };
    Promise.resolve(
      middleware(req, res, (err) => {
        out.answer = err ? { next: String(err) } : 'next';
        resolve();
      })
    ).then(resolve, resolve);
  });
  const attached = {};
  if (req.user) attached.user = { userId: req.user.userId, role: req.user.role, type: req.user.type };
  if (req.session) attached.sessionId = req.session.id;
  if (req.userId !== undefined) attached.userId = req.userId;
  if (req.maxConcurrentUsers !== undefined) attached.maxConcurrentUsers = req.maxConcurrentUsers;
  if (req.currentActiveUsers !== undefined) attached.currentActiveUsers = req.currentActiveUsers;
  return { answer: out.answer, ...(Object.keys(attached).length ? { req: attached } : {}), ...(Object.keys(out.headers).length ? { headers: out.headers } : {}) };
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });
const doctorToken = () => accessToken({ userId: 42, role: 'DOC', username: 'doc' });
const expiredToken = () =>
  jwt.sign({ userId: 42, role: 'DOC', type: 'access', exp: Math.floor(Date.now() / 1000) - 60 }, getJwtSecret());

const kvRows = (stored) => (call) =>
  call.replacements.keys.filter((k) => k in stored).map((k) => ({ configKey: k, value: stored[k] }));
const noSuchTable = () => Object.assign(new Error('no table'), { original: { code: 'ER_NO_SUCH_TABLE' } });

/** [name, run(models) → result]. `models` answers Session / Account calls; `rules` the SQL. */
const SCENARIOS = [
  // ---- authenticateToken
  ['auth: no Authorization header', () => run(authenticateToken)],
  ['auth: malformed token', () => run(authenticateToken, { headers: bearer('not-a-jwt') })],
  ['auth: expired JWT', () => run(authenticateToken, { headers: bearer(expiredToken()) })],
  ['auth: refresh token used as access token', () => run(authenticateToken, { headers: bearer(refreshToken()) })],
  ['auth: no session for the token', () => run(authenticateToken, { headers: bearer(doctorToken()) })],
  [
    'auth: session past expiresAt is deleted',
    () => {
      db.state.models['Session.findOne'] = () => sessionRow({ expiresAt: new Date(Date.now() - 1000) });
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],
  [
    'auth: account missing',
    () => {
      db.state.models['Session.findOne'] = () => sessionRow();
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],
  [
    'auth: account inactive',
    () => {
      db.state.models['Session.findOne'] = () => sessionRow();
      db.state.models['Account.findOne'] = () => ({ status: 0, getDataValue: () => 0 });
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],
  [
    'auth: account status as text "active"',
    () => {
      db.state.models['Session.findOne'] = () => sessionRow();
      db.state.models['Account.findOne'] = () => ({ status: 'active' });
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],
  [
    'auth: valid session — role normalized, lastActivity stamped',
    () => {
      db.state.models['Session.findOne'] = () => sessionRow();
      db.state.models['Account.findOne'] = () => activeAccount;
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],
  [
    'auth: session lookup fails',
    () => {
      db.state.models['Session.findOne'] = () => dbError();
      return run(authenticateToken, { headers: bearer(doctorToken()) });
    },
  ],

  // ---- checkConcurrentUsers
  [
    'concurrent: under the configured cap',
    () => {
      db.state.rules = [[/`key` = 'maxConcurrentUsers'/, [{ id: 1, key: 'maxConcurrentUsers', value: '3', description: null }]]];
      db.state.models['Session.count'] = () => 2;
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],
  [
    'concurrent: cap reached',
    () => {
      db.state.rules = [[/`key` = 'maxConcurrentUsers'/, [{ id: 1, key: 'maxConcurrentUsers', value: '3', description: null }]]];
      db.state.models['Session.count'] = () => 3;
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],
  [
    'concurrent: no stored cap → default cap 500',
    () => {
      db.state.models['Session.count'] = () => 499;
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],
  [
    'concurrent: stored cap not a positive number → default cap 500',
    () => {
      db.state.rules = [[/`key` = 'maxConcurrentUsers'/, [{ id: 1, key: 'maxConcurrentUsers', value: 'abc', description: null }]]];
      db.state.models['Session.count'] = () => 500;
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],
  [
    'concurrent: config table unreadable → default cap 500',
    () => {
      db.state.rules = [[/maxConcurrentUsers/, legacySchemaError()]];
      db.state.models['Session.count'] = () => 1;
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],
  [
    'concurrent: count fails → passes',
    () => {
      db.state.models['Session.count'] = () => dbError();
      return run(sessionMiddleware.checkConcurrentUsers);
    },
  ],

  // ---- rate limiter policy loading
  [
    'rate limit: key/value policy, 2 allowed',
    async () => {
      db.state.rules = [[/AS configKey, value FROM SYSTEM_CONFIGURATION/, kvRows({ rateLimitEnabled: 'true', loginRateLimitRequests: '2', loginRateLimitWindowSeconds: '30' })]];
      const { authLoginRateLimit } = freshLimiters();
      return [await run(authLoginRateLimit), await run(authLoginRateLimit), await run(authLoginRateLimit)];
    },
  ],
  [
    'rate limit: key/value policy disabled',
    async () => {
      db.state.rules = [[/AS configKey, value FROM SYSTEM_CONFIGURATION/, kvRows({ rateLimitEnabled: 'false' })]];
      return run(freshLimiters().aiChatRateLimit);
    },
  ],
  [
    'rate limit: per-user key when not IP based',
    async () => {
      db.state.rules = [[/AS configKey, value FROM SYSTEM_CONFIGURATION/, kvRows({ rateLimitIpBased: 'false', chatbotRateLimitRequests: '1' })]];
      const { aiChatRateLimit } = freshLimiters();
      const token = doctorToken();
      return [
        await run(aiChatRateLimit, { headers: bearer(token), ip: '10.0.0.1' }),
        await run(aiChatRateLimit, { headers: bearer(token), ip: '10.0.0.2' }),
      ];
    },
  ],
  [
    'rate limit: no key/value rows → legacy rate_limit column',
    async () => {
      db.state.rules = [[/SELECT rate_limit AS rateLimit/, [{ rateLimit: '1', accessLimit: '5' }]]];
      const { appointmentRateLimit } = freshLimiters();
      return [await run(appointmentRateLimit), await run(appointmentRateLimit)];
    },
  ],
  [
    'rate limit: global scope uses legacy access_limit',
    async () => {
      db.state.rules = [
        [/AS configKey, value FROM SYSTEM_CONFIGURATION/, legacySchemaError()],
        [/SELECT rate_limit AS rateLimit/, [{ rateLimit: '9', accessLimit: '1' }]],
      ];
      const { globalRateLimit } = freshLimiters();
      return [await run(globalRateLimit), await run(globalRateLimit)];
    },
  ],
  [
    'rate limit: no SYSTEM_CONFIGURATION table → defaults, table not asked again',
    async () => {
      db.state.rules = [[/SYSTEM_CONFIGURATION/, noSuchTable()]];
      const { aiSymptomRateLimit, aiChatRateLimit } = freshLimiters();
      return [await run(aiSymptomRateLimit), await run(aiChatRateLimit)];
    },
  ],
  [
    'rate limit: other DB error → request passes',
    async () => {
      db.state.rules = [[/SYSTEM_CONFIGURATION/, dbError()]];
      return run(freshLimiters().authRegistrationRateLimit);
    },
  ],
];

test('middleware characterization', async () => {
  const actual = {};
  for (const [name, scenario] of SCENARIOS) {
    db.reset();
    const result = await scenario();
    actual[name] = { result, db: db.state.calls };
  }
  const json = JSON.parse(JSON.stringify(actual));
  if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(SNAPSHOT)) {
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(json, null, 2)}\n`);
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  for (const name of Object.keys(expected)) {
    assert.deepEqual(json[name], expected[name], `scenario: ${name}`);
  }
  assert.deepEqual(Object.keys(json), Object.keys(expected));
});

describeApp();

/** Through the whole app: what one request costs, and who answers a stale session. */
function describeApp() {
  let server;
  test.before(async () => {
    server = await startTestServer();
  });
  test.after(() => server?.close());

  const events = (name) => db.state.calls.filter((c) => c.event === name);

  test('an authenticated request looks up and stamps its session once', async () => {
    db.reset();
    db.state.models['Session.findOne'] = () => sessionRow();
    db.state.models['Account.findOne'] = () => activeAccount;
    const res = await fetch(`${server.baseUrl}/api/notifications/unread-count`, { headers: bearer(doctorToken()) });
    assert.equal(res.status, 200);
    assert.equal(events('Session.findOne').length, 1);
    assert.equal(events('Session#persist').length, 1);
  });

  test('an expired session on a protected route: 401 SESSION_EXPIRED, session deleted', async () => {
    db.reset();
    db.state.models['Session.findOne'] = () => sessionRow({ expiresAt: new Date(Date.now() - 1000) });
    const res = await fetch(`${server.baseUrl}/api/notifications/unread-count`, { headers: bearer(doctorToken()) });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'SESSION_EXPIRED');
    assert.deepEqual(events('Session.destroy').map((c) => c.where), [{ id: 7 }]);
  });

  test('a stale Authorization header does not block a public route', async () => {
    db.reset();
    db.state.models['Session.findOne'] = () => sessionRow({ expiresAt: new Date(Date.now() - 1000) });
    const res = await fetch(`${server.baseUrl}/api/auth/refresh`, { method: 'POST', headers: bearer(doctorToken()) });
    const body = await res.json();
    assert.notEqual(body.error, 'Session expired. Please login again.');
    assert.equal(events('Session.findOne').length, 0);
  });
}
