/**
 * POST /api/auth/change-password and the forced change for admin-issued passwords
 * (ACCOUNT.must_change_password): while the flag is set every authenticated route answers
 * 403 PASSWORD_CHANGE_REQUIRED except change password, logout and session info.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const { startTestServer } = require('./helpers/app');
const { installFakeDb, fakeInstance, accessToken, ADMIN_USER_ID } = require('./helpers/fakeDb');

const CURRENT = 'Issued#2026';
const CURRENT_HASH = bcrypt.hashSync(CURRENT, 4);

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

/** Every Account.findOne (authMiddleware, login, the service) answers this account. */
function withAccount({ mustChange }) {
  db.reset();
  const account = fakeInstance(
    'Account',
    {
      user_id: ADMIN_USER_ID,
      username: 'nurse1',
      password: CURRENT_HASH,
      type: 'NUR',
      status: 1,
      must_change_password: mustChange,
      User: { first_name: 'Lan', last_name: 'Tran' },
    },
    db.state
  );
  db.state.models['Account.findOne'] = () => account;
  return account;
}

async function call(method, urlPath, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${accessToken({ role: 'NUR', username: 'nurse1' })}`;
  const res = await fetch(`${server.baseUrl}${urlPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const events = (name) => db.state.calls.filter((c) => c.event === name);

test('pending change: other routes answer 403 PASSWORD_CHANGE_REQUIRED', async () => {
  withAccount({ mustChange: true });
  const res = await call('GET', '/api/notifications/unread-count');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('pending change: session info and logout still work, session says so', async () => {
  withAccount({ mustChange: true });
  const session = await call('GET', '/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.user.mustChangePassword, true);

  withAccount({ mustChange: true });
  assert.equal((await call('POST', '/api/auth/logout', {})).status, 200);
});

test('no pending change: routes work as before', async () => {
  withAccount({ mustChange: false });
  assert.equal((await call('GET', '/api/notifications/unread-count')).status, 200);
});

test('login tells the client a change is required', async () => {
  withAccount({ mustChange: true });
  const res = await call('POST', '/api/auth/login', { username: 'nurse1', password: CURRENT }, { auth: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, true);
});

for (const [label, body, message] of [
  ['missing current password', { newPassword: 'Mine#2026a' }, 'Current password is required'],
  ['missing new password', { currentPassword: CURRENT }, 'New password is required'],
  ['wrong current password', { currentPassword: 'Nope#2026', newPassword: 'Mine#2026a' }, 'Current password is incorrect'],
  ['weak new password', { currentPassword: CURRENT, newPassword: 'short' }, 'Password must be at least 8 characters long'],
  ['new password lacks a digit', { currentPassword: CURRENT, newPassword: 'NoDigitsHere' }, 'Password must contain at least one number'],
  ['same as current', { currentPassword: CURRENT, newPassword: CURRENT }, 'New password must be different from the current password'],
]) {
  test(`change password, ${label}: 400, nothing written`, async () => {
    withAccount({ mustChange: true });
    const res = await call('POST', '/api/auth/change-password', body);
    assert.equal(res.status, 400);
    assert.equal(res.body.error ?? res.body.message, message);
    assert.deepEqual(events('Account#update'), []);
    assert.deepEqual(events('Session.destroy'), []);
  });
}

test('change password: new hash stored, flag cleared, other sessions ended', async () => {
  const account = withAccount({ mustChange: true });
  const res = await call('POST', '/api/auth/change-password', { currentPassword: CURRENT, newPassword: 'Mine#2026a' });
  assert.deepEqual(res, { status: 200, body: { success: true, message: 'Password changed' } });

  const [update] = events('Account#update');
  assert.equal(update.values.must_change_password, false);
  assert.equal(await bcrypt.compare('Mine#2026a', update.values.password), true);
  assert.equal(account.must_change_password, false);
  assert.deepEqual(
    events('Session.destroy').map((c) => c.where),
    [{ userId: ADMIN_USER_ID, id: { '[ne]': 999 } }]
  );
});

test('change password without a token: 401', async () => {
  db.reset();
  const res = await call('POST', '/api/auth/change-password', { currentPassword: CURRENT, newPassword: 'Mine#2026a' }, { auth: false });
  assert.equal(res.status, 401);
});
