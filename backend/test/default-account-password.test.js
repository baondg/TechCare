/**
 * Admin-created accounts get DEFAULT_ACCOUNT_PASSWORD as their initial password. Without it — or
 * with the demo password published in the docs — account creation is refused instead of falling
 * back to a password everyone knows.
 */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');

const { installFakeDb } = require('./helpers/fakeDb');

const DIST = path.join(__dirname, '..', 'dist');
const { config } = require(path.join(DIST, 'config', 'env'));
const accountService = require(path.join(DIST, 'services', 'admin', 'accountService'));

const BODY = {
  username: 'newbie',
  roleCode: 'pat',
  name: 'Nguyen Van An',
  sex: 'Male',
  dob: '1995-01-01',
  phone: '0911111111',
  email: '',
};

let db;
const configured = config.auth.defaultAccountPassword;
test.before(() => {
  db = installFakeDb();
});
test.after(() => {
  config.auth.defaultAccountPassword = configured;
  db.restore();
});

async function createWith(password) {
  db.reset();
  db.state.rules = [
    [/^INSERT INTO USER/, [101, 1]],
    [/WHERE a.user_id = :userId LIMIT 1$/, [{ userId: 101, username: 'newbie', type: 'PAT', status: 1 }]],
  ];
  config.auth.defaultAccountPassword = password;
  return accountService.createAccount(BODY, 1);
}

for (const [label, value] of [
  ['unset', ''],
  ['the published demo password', 'Test@1234'],
]) {
  test(`DEFAULT_ACCOUNT_PASSWORD ${label}: creation refused, nothing written`, async () => {
    await assert.rejects(createWith(value), (err) => {
      assert.equal(err.statusCode, 500);
      assert.equal(err.expose, true);
      assert.match(err.message, /DEFAULT_ACCOUNT_PASSWORD/);
      return true;
    });
    assert.deepEqual(db.state.calls, []);
  });
}

test('DEFAULT_ACCOUNT_PASSWORD set: the account gets it, hashed', async () => {
  await createWith('Clinic#Start2026');
  const insert = db.state.calls.find((c) => /^INSERT INTO ACCOUNT/.test(c.sql || ''));
  assert.ok(insert, 'ACCOUNT inserted');
  assert.equal(await bcrypt.compare('Clinic#Start2026', insert.replacements.password), true);
});
