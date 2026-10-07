/**
 * Characterization of /api/admin/* and the SQL-backed /api/system-config/* endpoints
 * (sessions, features), run against a fake DB (helpers/fakeDb.js).
 *
 * For each scenario it records the exact SQL sent (whitespace-collapsed), its replacements and
 * transaction, plus the HTTP status and response. The snapshot was captured before the SQL moved
 * from controllers into repositories (G3 step B), so it pins that refactor to "same queries, same
 * answers". Error bodies are compared by status + message text only: the standard AppError body
 * (`error` + `message` + `code`) is an intended change.
 *
 * Intentional change? Regenerate and review the diff:
 *   UPDATE_SNAPSHOTS=1 npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { startTestServer } = require('./helpers/app');
const { installFakeDb, adminToken, ADMIN_USER_ID } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'admin-sql.snapshot.json');

const dbError = () => Object.assign(new Error('boom'), { name: 'SequelizeDatabaseError' });

const ACCOUNT_ROW = {
  userId: 42,
  username: 'jdoe',
  type: 'DOC',
  status: 1,
  createdTime: '2026-01-02T03:04:05.000Z',
  createdBy: 1,
  createdByName: 'Root Admin',
  nationalId: '000000000042',
  name: 'John Doe',
  sex: 'M',
  dob: '1990-05-06',
  phone: '0900000000',
  email: 'j@example.com',
  doctorId: 7,
  doctorSpecifications: 'Cardiology',
  doctorQualifications: 'MD',
  doctorDepartmentIdsCsv: '3,4',
};

const FEEDBACK_ROW = {
  id: 5,
  userId: 42,
  type: 'bug',
  content: 'Slow page',
  rating: 4,
  time: '2026-02-03T00:00:00.000Z',
  status: 0,
  response: null,
  username: 'jdoe',
  roleCode: 'PAT',
  userName: '  ',
};

const VALID_ACCOUNT_BODY = {
  username: 'newbie',
  roleCode: 'pat',
  name: 'Nguyen Van An',
  sex: 'Male',
  dob: '1995-01-01',
  phone: '0911111111',
  email: '',
};

/** [name, method, path, body, rules, setup?] */
const SCENARIOS = [
  // ---- dashboard
  [
    'dashboard summary',
    'GET',
    '/api/admin/dashboard-summary',
    null,
    [
      [/^SELECT COUNT\(\*\) AS totalUsers/, [{ totalUsers: 10, activeUsers: '7' }]],
      [/GROUP BY type/, [{ type: 'PAT', total: 6 }, { type: 'XYZ', total: 1 }]],
      [/LIMIT 6$/, [{ id: 3, username: null, type: 'NUR', status: '1', createdTime: null }]],
      [/FROM FEEDBACK f$/, [{ total: 4, pending: '2', averageRating: '3.5' }]],
      [/DATE\(a.created_time\) AS day/, [{ day: 'TODAY', count: 2 }]],
      [/^SELECT 1 AS ok$/, [{ ok: 1 }]],
    ],
  ],
  ['dashboard summary, db down', 'GET', '/api/admin/dashboard-summary', null, [[/./, dbError]]],

  // ---- departments
  ['list departments', 'GET', '/api/admin/departments', null, [[/FROM DEPARTMENT/, [{ id: '2', name: 'ER' }, { id: 1, name: null }]]]],
  ['list departments, db down', 'GET', '/api/admin/departments', null, [[/./, dbError]]],

  // ---- accounts list
  [
    'list accounts, defaults',
    'GET',
    '/api/admin/accounts',
    null,
    [
      [/^SELECT COUNT\(\*\) AS total/, [{ total: 1 }]],
      [/FROM ACCOUNT a LEFT JOIN USER u/, [ACCOUNT_ROW]],
    ],
  ],
  [
    'list accounts, every filter + sort',
    'GET',
    '/api/admin/accounts?page=2&limit=500&sortBy=name&sortDirection=ASC&userId=4&name=Jo&username=jd&roleCode=doc&sex=Male&dob=1990&phone=090&email=ex&enabled=active',
    null,
    [[/^SELECT COUNT\(\*\) AS total/, [{ total: 250 }]]],
  ],
  [
    'list accounts, junk params fall back',
    'GET',
    '/api/admin/accounts?page=abc&limit=-3&sortBy=password&sortDirection=sideways&roleCode=ROOT&sex=Other&enabled=inactive',
    null,
    [[/^SELECT COUNT\(\*\) AS total/, [{ total: 0 }]]],
  ],
  ['list accounts, db down', 'GET', '/api/admin/accounts', null, [[/./, dbError]]],

  // ---- create account
  [
    'create patient account',
    'POST',
    '/api/admin/accounts',
    VALID_ACCOUNT_BODY,
    [
      [/^INSERT INTO USER/, [101, 1]],
      [/WHERE a.user_id = :userId LIMIT 1$/, [{ ...ACCOUNT_ROW, userId: 101, type: 'PAT', doctorId: null, doctorDepartmentIdsCsv: null }]],
    ],
  ],
  [
    'create doctor account syncs DOCTOR + departments',
    'POST',
    '/api/admin/accounts',
    {
      ...VALID_ACCOUNT_BODY,
      roleCode: 'DOC',
      enabled: false,
      sex: 'Female',
      email: 'doc@example.com',
      doctorSpecifications: ' Cardiology ',
      qualifications: 'MD',
      departmentIds: [3, '4', 'x', -1, 3],
    },
    [
      [/^INSERT INTO USER/, [102, 1]],
      [/^SELECT id FROM DEPARTMENT WHERE id IN/, [{ id: 3 }]],
      [/^INSERT INTO DOCTOR \(/, [55, 1]],
      [/WHERE a.user_id = :userId LIMIT 1$/, [ACCOUNT_ROW]],
    ],
  ],
  [
    'create account, duplicate username',
    'POST',
    '/api/admin/accounts',
    VALID_ACCOUNT_BODY,
    [[/WHERE username = :username/, [{ userId: 9 }]]],
  ],
  ['create account, missing name', 'POST', '/api/admin/accounts', { ...VALID_ACCOUNT_BODY, name: ' ' }, []],
  ['create account, bad role', 'POST', '/api/admin/accounts', { ...VALID_ACCOUNT_BODY, roleCode: 'ROOT' }, []],
  ['create account, future dob', 'POST', '/api/admin/accounts', { ...VALID_ACCOUNT_BODY, dob: '2999-01-01' }, []],
  ['create account, db down', 'POST', '/api/admin/accounts', VALID_ACCOUNT_BODY, [[/^INSERT INTO USER/, dbError]]],

  // ---- update account
  ['update account, bad id', 'PATCH', '/api/admin/accounts/abc', VALID_ACCOUNT_BODY, []],
  ['update account, not found', 'PATCH', '/api/admin/accounts/42', VALID_ACCOUNT_BODY, []],
  [
    'update account, cannot disable admin',
    'PATCH',
    '/api/admin/accounts/42',
    { ...VALID_ACCOUNT_BODY, enabled: false },
    [[/^SELECT user_id AS userId, type, status FROM ACCOUNT/, [{ userId: 42, type: 'adm', status: 1 }]]],
  ],
  [
    'update account, invalid dob',
    'PATCH',
    '/api/admin/accounts/42',
    { ...VALID_ACCOUNT_BODY, dob: '2020-02-30' },
    [[/^SELECT user_id AS userId, type, status FROM ACCOUNT/, [{ userId: 42, type: 'PAT', status: 1 }]]],
  ],
  [
    'update doctor account',
    'PATCH',
    '/api/admin/accounts/42',
    { ...VALID_ACCOUNT_BODY, name: 'Solo', doctorDepartmentIds: [4], specifications: '' },
    [
      [/^SELECT user_id AS userId, type, status FROM ACCOUNT/, [{ userId: 42, type: 'DOC', status: 1 }]],
      [/^SELECT id FROM DEPARTMENT WHERE id IN/, [{ id: 4 }]],
      [/^SELECT doctor_id AS doctorId FROM DOCTOR/, [{ doctorId: 7 }]],
      [/WHERE a.user_id = :userId LIMIT 1$/, [ACCOUNT_ROW]],
    ],
  ],
  [
    'update account, db down',
    'PATCH',
    '/api/admin/accounts/42',
    VALID_ACCOUNT_BODY,
    [
      [/^SELECT user_id AS userId, type, status FROM ACCOUNT/, [{ userId: 42, type: 'PAT', status: 1 }]],
      [/^UPDATE USER/, dbError],
    ],
  ],

  // ---- account status
  ['account status, bad id', 'PATCH', '/api/admin/accounts/x/status', { status: true }, []],
  ['account status, not found', 'PATCH', '/api/admin/accounts/42/status', { status: true }, []],
  [
    'account status, cannot disable admin',
    'PATCH',
    '/api/admin/accounts/42/status',
    { status: 0 },
    [[/FROM ACCOUNT WHERE user_id/, [{ userId: 42, type: 'ADM' }]]],
  ],
  [
    'account status, disable patient',
    'PATCH',
    '/api/admin/accounts/42/status',
    {},
    [[/FROM ACCOUNT WHERE user_id/, [{ userId: 42, type: 'PAT' }]]],
  ],

  // ---- feedbacks
  ['list feedbacks', 'GET', '/api/admin/feedbacks', null, [[/FROM FEEDBACK f/, [FEEDBACK_ROW]]]],
  ['list feedbacks, db down', 'GET', '/api/admin/feedbacks', null, [[/./, dbError]]],
  ['update feedback, bad id', 'PATCH', '/api/admin/feedbacks/abc', { status: true }, []],
  ['update feedback, nothing to update', 'PATCH', '/api/admin/feedbacks/5', { other: 1 }, []],
  ['update feedback, not found', 'PATCH', '/api/admin/feedbacks/5', { response: 'hi' }, []],
  [
    'update feedback, response + status',
    'PATCH',
    '/api/admin/feedbacks/5',
    { response: '  Thanks!  ', status: 'yes' },
    [
      [/^SELECT id FROM FEEDBACK/, [{ id: 5 }]],
      [/WHERE f.id = :id LIMIT 1$/, [{ ...FEEDBACK_ROW, status: 1, response: 'Thanks!' }]],
    ],
  ],
  [
    'update feedback, blank response clears it',
    'PATCH',
    '/api/admin/feedbacks/5',
    { response: '   ' },
    [
      [/^SELECT id FROM FEEDBACK/, [{ id: 5 }]],
      [/WHERE f.id = :id LIMIT 1$/, [FEEDBACK_ROW]],
    ],
  ],

  // ---- system-config: features
  [
    'list features',
    'GET',
    '/api/system-config/features',
    null,
    [[/FROM FEATURE/, [{ id: 1, name: 'chat', status: '1', featureGroup: 'ai', systemId: 1 }, { id: 2, name: 'x', status: 7, featureGroup: 'ai', systemId: 1 }]]],
  ],
  ['list features, db down', 'GET', '/api/system-config/features', null, [[/./, dbError]]],
  ['feature status, bad id', 'PUT', '/api/system-config/features/0/status', { status: true }, []],
  ['feature status, bad status', 'PUT', '/api/system-config/features/1/status', { status: 'maybe' }, []],
  ['feature status, not found', 'PUT', '/api/system-config/features/1/status', { status: 'FALSE' }, []],
  [
    'feature status, enable',
    'PUT',
    '/api/system-config/features/1/status',
    { status: '1' },
    [[/^SELECT id, name, status/, [{ id: 1, name: 'chat', status: 1, featureGroup: 'ai', systemId: 1 }]]],
  ],

  // ---- system-config: sessions
  [
    'list sessions',
    'GET',
    '/api/system-config/sessions',
    null,
    [[/FROM SESSION s/, [{ id: 3, userId: 42, lastActivity: null, expiresAt: null, ipAddress: '::1', userAgent: 'ua', roleCode: 'PAT' }]]],
  ],
  ['list sessions, db down', 'GET', '/api/system-config/sessions', null, [[/./, dbError]]],
  ['revoke session, bad id', 'DELETE', '/api/system-config/sessions/-1', null, []],
  ['revoke session, not found', 'DELETE', '/api/system-config/sessions/3', null, []],
  [
    'revoke session, own session',
    'DELETE',
    '/api/system-config/sessions/3',
    null,
    [],
    (state) => state.sessionRows.set(3, { id: 3, userId: ADMIN_USER_ID }),
  ],
  [
    'revoke session, admin target',
    'DELETE',
    '/api/system-config/sessions/3',
    null,
    [[/^SELECT type FROM ACCOUNT/, [{ type: ' adm ' }]]],
    (state) => state.sessionRows.set(3, { id: 3, userId: 42 }),
  ],
  [
    'revoke session, ok',
    'DELETE',
    '/api/system-config/sessions/3',
    null,
    [[/^SELECT type FROM ACCOUNT/, [{ type: 'PAT' }]]],
    (state) => state.sessionRows.set(3, { id: 3, userId: 42 }),
  ],
  [
    'revoke session, already gone',
    'DELETE',
    '/api/system-config/sessions/3',
    null,
    [],
    (state) => {
      state.sessionRows.set(3, { id: 3, userId: 42 });
      state.destroyResult = 0;
    },
  ],
  ['revoke all, bad userId', 'POST', '/api/system-config/sessions/revoke-all', { userId: 'abc' }, []],
  ['revoke all, own user', 'POST', '/api/system-config/sessions/revoke-all', { userId: ADMIN_USER_ID }, []],
  [
    'revoke all, admin user',
    'POST',
    '/api/system-config/sessions/revoke-all',
    { userId: '42' },
    [[/^SELECT type FROM ACCOUNT/, [{ type: 'ADM' }]]],
  ],
  [
    'revoke all for one user',
    'POST',
    '/api/system-config/sessions/revoke-all',
    { userId: 42 },
    [[/^SELECT type FROM ACCOUNT/, [{ type: 'NUR' }]]],
    (state) => {
      state.destroyResult = 2;
    },
  ],
  [
    'revoke all non-admin sessions',
    'POST',
    '/api/system-config/sessions/revoke-all',
    { userId: '' },
    [[/WHERE type = 'ADM'/, [{ userId: 1 }, { userId: '8' }, { userId: null }]]],
    (state) => {
      state.destroyResult = 5;
    },
  ],
  [
    'revoke all, no admins',
    'POST',
    '/api/system-config/sessions/revoke-all',
    null,
    [],
  ],
  ['revoke all, db down', 'POST', '/api/system-config/sessions/revoke-all', {}, [[/./, dbError]]],
];

/** Strip values that change per run (time, bcrypt salt) so the snapshot is stable. */
function scrub(value) {
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (key === 'password' && typeof v === 'string' && v.startsWith('$2')) return '<bcrypt>';
      if (key === 'idcard') return '<idcard>';
      if (key === 'clinicToday') return '<today>';
      if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return '<date>';
      return v;
    })
  );
}

function describeResponse(status, body) {
  if (status < 400) return { status, body };
  const text = body?.message ?? body?.error ?? null;
  // 5xx text is generic either way; only its presence matters.
  return { status, message: status >= 500 ? String(text).toLowerCase() : text };
}

let server;
let db;

test.before(async () => {
  db = installFakeDb();
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
  db?.restore();
});

test('admin + system-config endpoints send the same SQL and answer the same', async () => {
  const token = adminToken();
  const actual = {};

  for (const [name, method, urlPath, body, rules, setup] of SCENARIOS) {
    db.reset();
    db.state.rules = rules.map(([re, result]) => [
      re,
      // Dashboard rows carry "TODAY" so the signups-by-day series hits the current clinic day.
      typeof result === 'function' ? result : resolveToday(result),
    ]);
    if (setup) setup(db.state);

    const res = await fetch(`${server.baseUrl}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    actual[name] = scrub({
      request: `${method} ${urlPath}`,
      response: describeResponse(res.status, json),
      db: db.state.calls,
    });
  }

  if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(SNAPSHOT)) {
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  for (const name of Object.keys(expected)) {
    assert.deepEqual(actual[name], expected[name], `scenario: ${name}`);
  }
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
});

function resolveToday(result) {
  if (!Array.isArray(result) || !result.some((r) => r && r.day === 'TODAY')) return result;
  const { getClinicTodayYmd } = require('../dist/common/clinicDate');
  return result.map((r) => (r.day === 'TODAY' ? { ...r, day: getClinicTodayYmd() } : r));
}
