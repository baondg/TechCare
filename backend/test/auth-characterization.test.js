/**
 * Characterization of /api/auth/* (login, refresh, logout, session, signup, nurse registers a
 * patient) over the fake DB. Records every model call (Account / Session / User / Patient), the
 * SYSTEM_CONFIGURATION reads, transactions, Set-Cookie and the HTTP answer. Snapshot captured
 * before the auth handlers moved onto repositories + services (G3 step B); see
 * helpers/characterize.js.
 */
const path = require('node:path');
const bcrypt = require('bcrypt');

const { characterize, dbError } = require('./helpers/characterize');
const { fakeInstance, accessToken, refreshToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'auth-sql.snapshot.json');

const PASSWORD = 'Secret123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const HOUR = 3600_000;

const configRule = (key, value) => [new RegExp(`\`key\` = '${key}';$`), [{ id: 1, key, value, description: null }]];

function loginAccount(state, overrides = {}, options = {}) {
  return fakeInstance(
    'Account',
    {
      user_id: 42,
      username: 'jdoe',
      password: PASSWORD_HASH,
      type: 'DOC',
      created_by: 1,
      created_time: '2026-01-01T00:00:00.000Z',
      status: 1,
      User: { first_name: 'An', last_name: 'Nguyen' },
      ...overrides,
    },
    state,
    options
  );
}

/** First Account.findOne is authMiddleware's (must be active); later ones answer the handler. */
function accountLookups(state, ...answers) {
  let n = 0;
  state.models['Account.findOne'] = () => {
    n += 1;
    if (n === 1) return { status: 1, getDataValue: () => 1 };
    const answer = answers[n - 2];
    return typeof answer === 'function' ? answer() : answer ?? null;
  };
}

function refreshSession(state, overrides = {}) {
  return fakeInstance(
    'Session',
    { id: 77, userId: 42, refreshToken: 'stored', expiresAt: new Date(Date.now() + 2 * HOUR), ...overrides },
    state
  );
}

const SIGNUP_BODY = {
  idcard: ' 079123456789 ',
  password: 'Passw0rdX',
  firstName: 'An',
  lastName: 'Nguyen',
  tel: ' 0901234567 ',
  dob: '1990-01-01',
  sex: 'M',
  email: ' an@example.com ',
};

const NURSE = { headers: { Authorization: `Bearer ${accessToken({ userId: 7, role: 'NUR', username: 'nurse' })}` } };
const NO_AUTH = { headers: { Authorization: null } };

const SCENARIOS = [
  // ---- login
  ['login, missing password', 'POST', '/api/auth/login', { username: 'jdoe' }, []],
  ['login, unknown user', 'POST', '/api/auth/login', { username: 'ghost', password: PASSWORD }, [], (s) => {
    s.models['Account.findOne'] = () => null;
  }],
  ['login, wrong password', 'POST', '/api/auth/login', { username: 'jdoe', password: 'nope' }, [], (s) => {
    s.models['Account.findOne'] = () => loginAccount(s);
  }],
  ['login, deactivated account', 'POST', '/api/auth/login', { username: 'jdoe', password: PASSWORD }, [], (s) => {
    s.models['Account.findOne'] = () => loginAccount(s, { status: 0 });
  }],
  [
    'login, configured session timeout',
    'POST',
    '/api/auth/login',
    { username: 'jdoe', password: PASSWORD },
    [configRule('sessionTimeoutMinutes', '45'), configRule('maxConcurrentUsers', '100')],
    (s) => {
      s.models['Account.findOne'] = () => loginAccount(s);
      s.models['Session.count'] = () => 3;
    },
  ],
  [
    'login, remember me (7 days), no profile',
    'POST',
    '/api/auth/login',
    { username: 'nurse1', password: PASSWORD, rememberMe: true },
    [],
    (s) => {
      s.models['Account.findOne'] = () => loginAccount(s, { username: 'nurse1', type: 'NUR', User: null });
    },
  ],
  [
    'login, config unreadable and last_login column missing',
    'POST',
    '/api/auth/login',
    { username: 'jdoe', password: PASSWORD },
    [[/SYSTEM_CONFIGURATION/, dbError]],
    (s) => {
      s.models['Account.findOne'] = () => loginAccount(s, { type: 'XYZ' }, { failUpdate: true });
    },
  ],
  [
    'login, too many concurrent users',
    'POST',
    '/api/auth/login',
    { username: 'jdoe', password: PASSWORD },
    [configRule('maxConcurrentUsers', '5')],
    (s) => {
      s.models['Session.count'] = () => 5;
    },
  ],
  ['login, db down', 'POST', '/api/auth/login', { username: 'jdoe', password: PASSWORD }, [], (s) => {
    s.models['Account.findOne'] = dbError;
  }],

  // ---- refresh
  ['refresh, no token', 'POST', '/api/auth/refresh', {}, [], () => NO_AUTH],
  ['refresh, garbage token', 'POST', '/api/auth/refresh', { refreshToken: 'garbage' }, [], () => NO_AUTH],
  [
    'refresh, access token instead of refresh token',
    'POST',
    '/api/auth/refresh',
    { refreshToken: accessToken({ userId: 42 }) },
    [],
    () => NO_AUTH,
  ],
  ['refresh, unknown session', 'POST', '/api/auth/refresh', { refreshToken: refreshToken() }, [], (s) => {
    s.models['Session.findOne'] = () => null;
    return NO_AUTH;
  }],
  ['refresh, expired session', 'POST', '/api/auth/refresh', { refreshToken: refreshToken() }, [], (s) => {
    s.models['Session.findOne'] = () => refreshSession(s, { expiresAt: new Date(Date.now() - HOUR) });
    return NO_AUTH;
  }],
  ['refresh, account gone', 'POST', '/api/auth/refresh', { refreshToken: refreshToken() }, [], (s) => {
    s.models['Session.findOne'] = () => refreshSession(s);
    s.models['Account.findOne'] = () => null;
    return NO_AUTH;
  }],
  ['refresh, rotates tokens (body)', 'POST', '/api/auth/refresh', { refreshToken: refreshToken() }, [], (s) => {
    s.models['Session.findOne'] = () => refreshSession(s);
    s.models['Account.findOne'] = () => loginAccount(s);
    return NO_AUTH;
  }],
  ['refresh, rotates tokens (cookie)', 'POST', '/api/auth/refresh', {}, [], (s) => {
    s.models['Session.findOne'] = () => refreshSession(s);
    s.models['Account.findOne'] = () => loginAccount(s);
    return { headers: { Authorization: null, Cookie: `refreshToken=${refreshToken()}` } };
  }],
  ['refresh, db down', 'POST', '/api/auth/refresh', { refreshToken: refreshToken() }, [], (s) => {
    s.models['Session.findOne'] = dbError;
    return NO_AUTH;
  }],

  // ---- logout / session
  ['logout this device', 'POST', '/api/auth/logout', {}, []],
  ['logout all devices', 'POST', '/api/auth/logout', { allDevices: true }, []],
  ['logout, db down', 'POST', '/api/auth/logout', {}, [], (s) => {
    s.models['Session.destroy'] = dbError;
  }],
  ['get session', 'GET', '/api/auth/session', null, [], (s) => {
    accountLookups(s, loginAccount(s, { user_id: 1, username: 'admin', type: 'ADM' }));
    s.models['Session.findAll'] = () => [
      fakeInstance('Session', { id: 3, lastActivity: null, ipAddress: '::1', userAgent: 'ua', expiresAt: null }, s),
    ];
  }],
  ['get session, account gone', 'GET', '/api/auth/session', null, [], (s) => accountLookups(s, null)],
  ['get session, db down', 'GET', '/api/auth/session', null, [], (s) => {
    s.models['Session.findAll'] = dbError;
  }],

  // ---- signup (public)
  ['signup, missing national id', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, idcard: '  ' }, [], () => NO_AUTH],
  ['signup, missing name', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, lastName: '' }, [], () => NO_AUTH],
  ['signup, missing phone', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, tel: ' ' }, [], () => NO_AUTH],
  ['signup, missing dob', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, dob: '' }, [], () => NO_AUTH],
  ['signup, bad email', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, email: 'not-an-email' }, [], () => NO_AUTH],
  ['signup, weak password', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, password: 'password1' }, [], () => NO_AUTH],
  ['signup, national id taken', 'POST', '/api/auth/signup', SIGNUP_BODY, [], (s) => {
    s.models['Account.findOne'] = () => ({ user_id: 9 });
    return NO_AUTH;
  }],
  ['signup', 'POST', '/api/auth/signup', { ...SIGNUP_BODY, email: '' }, [], (s) => {
    s.models['Account.findOne'] = () => null;
    s.models['User.create'] = () => fakeInstance('User', { id: 501 }, s);
    return NO_AUTH;
  }],
  ['signup, db down', 'POST', '/api/auth/signup', SIGNUP_BODY, [], (s) => {
    s.models['Account.findOne'] = () => null;
    s.models['User.create'] = dbError;
    return NO_AUTH;
  }],

  // ---- nurse registers a patient
  ['register patient, not a nurse', 'POST', '/api/auth/register-patient', SIGNUP_BODY, []],
  ['register patient, invalid body', 'POST', '/api/auth/register-patient', { ...SIGNUP_BODY, password: 'short' }, [], () => NURSE],
  ['register patient', 'POST', '/api/auth/register-patient', SIGNUP_BODY, [], (s) => {
    accountLookups(s, null);
    s.models['User.create'] = () => fakeInstance('User', { id: 502 }, s);
    return NURSE;
  }],
  ['register patient, db down', 'POST', '/api/auth/register-patient', SIGNUP_BODY, [], (s) => {
    accountLookups(s, null);
    s.models['Patient.findOrCreate'] = dbError;
    return NURSE;
  }],
];

/** Session / account timestamps relative to now, in minutes (e.g. `<now+45m>`). */
const RELATIVE_TIME_KEYS = new Set(['expiresAt', 'lastActivity', 'created_time', 'lastLogin']);
function scrubValue(key, value) {
  if (!RELATIVE_TIME_KEYS.has(key) || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  if (value === '2026-01-01T00:00:00.000Z') return value; // fixture constant
  const minutes = Math.round((Date.parse(value) - Date.now()) / 60_000);
  return minutes === 0 ? '<now>' : `<now${minutes > 0 ? '+' : ''}${minutes}m>`;
}

characterize('auth endpoints make the same DB calls and answer the same', SNAPSHOT, SCENARIOS, {
  scrubValue,
  codes: ['ACCOUNT_DEACTIVATED', 'NO_TOKEN', 'INVALID_SESSION', 'ACCOUNT_INACTIVE', 'TOKEN_EXPIRED'],
});
