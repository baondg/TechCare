/**
 * Admin-issued temporary passwords: generator, account creation / reset store the hash of the
 * password they return and set the forced-change flag, and the audit that flags accounts still on
 * a shared initial password.
 */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');

const { installFakeDb } = require('./helpers/fakeDb');

const DIST = path.join(__dirname, '..', 'dist');
const { generateTemporaryPassword, validatePasswordStrength } = require(path.join(DIST, 'services', 'auth', 'passwordPolicy'));
const accountService = require(path.join(DIST, 'services', 'admin', 'accountService'));
const audit = require(path.join(DIST, 'services', 'admin', 'sharedPasswordAudit'));

let db;
test.before(() => {
  db = installFakeDb();
});
test.after(() => db.restore());

const sqlCalls = (re) => db.state.calls.filter((c) => re.test(c.sql || ''));

test('temporary passwords: 14 unambiguous characters, pass the strength rule, differ', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    const password = generateTemporaryPassword();
    assert.match(password, /^[A-HJ-NP-Za-km-z2-9]{14}$/);
    assert.deepEqual(validatePasswordStrength(password), { valid: true });
    seen.add(password);
  }
  assert.equal(seen.size, 500);
});

test('create account: stores the hash of the returned temporary password, flagged', async () => {
  db.reset();
  db.state.rules = [
    [/^INSERT INTO USER/, [101, 1]],
    [/WHERE a.user_id = :userId LIMIT 1$/, [{ userId: 101, username: 'newbie', type: 'PAT', status: 1 }]],
  ];
  const { account, temporaryPassword } = await accountService.createAccount(
    { username: 'newbie', roleCode: 'pat', name: 'Nguyen Van An', sex: 'Male', dob: '1995-01-01', phone: '0911111111', email: '' },
    1
  );
  assert.equal(account.username, 'newbie');
  const [insert] = sqlCalls(/^INSERT INTO ACCOUNT/);
  assert.equal(insert.replacements.mustChangePassword, 1);
  assert.equal(await bcrypt.compare(temporaryPassword, insert.replacements.password), true);
});

test('reset password: stores the hash of the returned temporary password, ends sessions', async () => {
  db.reset();
  db.state.rules = [[/^SELECT user_id AS userId, type FROM ACCOUNT/, [{ userId: 42, type: 'DOC' }]]];
  const { temporaryPassword } = await accountService.resetPassword(42, 1);
  const [update] = sqlCalls(/^UPDATE ACCOUNT SET password/);
  assert.equal(await bcrypt.compare(temporaryPassword, update.replacements.password), true);
  assert.deepEqual(db.state.calls.filter((c) => c.event === 'Session.destroy').map((c) => c.where), [{ userId: 42 }]);
});

const HASH_SHARED = bcrypt.hashSync('Test@1234', 4);
const HASH_OTHER_SHARED = bcrypt.hashSync('Clinic#Start2026', 4);
const HASH_OWN = bcrypt.hashSync('Mine#2026a', 4);

function auditRows() {
  db.reset();
  db.state.rules = [
    [
      /FROM ACCOUNT WHERE must_change_password = 0/,
      [
        { userId: 1, username: 'admin', type: 'ADM', password: HASH_SHARED },
        { userId: 2, username: 'doc', type: 'DOC', password: HASH_OWN },
        { userId: 3, username: 'nurse', type: 'NUR', password: HASH_OTHER_SHARED },
        { userId: 4, username: 'legacy', type: 'PAT', password: null },
      ],
    ],
  ];
}

test('shared-password audit, dry run: lists matches, writes nothing', async () => {
  auditRows();
  const { matches, applied } = await audit.flagAccountsUsingSharedPasswords(['Test@1234', 'Clinic#Start2026', undefined, '']);
  assert.equal(applied, false);
  assert.deepEqual(matches, [
    { userId: 1, username: 'admin', type: 'ADM' },
    { userId: 3, username: 'nurse', type: 'NUR' },
  ]);
  assert.deepEqual(sqlCalls(/^UPDATE/), []);
});

test('shared-password audit, apply: flags only the matches', async () => {
  auditRows();
  await audit.flagAccountsUsingSharedPasswords(audit.KNOWN_SHARED_PASSWORDS, { apply: true });
  const updates = sqlCalls(/^UPDATE ACCOUNT SET must_change_password = 1/);
  assert.deepEqual(updates.map((c) => c.replacements), [{ userIds: [1] }]);
});

test('shared-password audit, apply with no match: no UPDATE', async () => {
  auditRows();
  await audit.flagAccountsUsingSharedPasswords(['Nobody#Uses1'], { apply: true });
  assert.deepEqual(sqlCalls(/^UPDATE/), []);
});
