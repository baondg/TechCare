/** /api/admin/* and /api/system-config/* are admin-only (same 403 text as before for everyone else). */
const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer } = require('./helpers/app');
const { installFakeDb, accessToken } = require('./helpers/fakeDb');

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

const get = (path, role) =>
  fetch(`${server.baseUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken({ userId: 5, role, username: 'u5' })}` } });

for (const path of ['/api/admin/dashboard-summary', '/api/admin/accounts', '/api/system-config', '/api/system-config/sessions']) {
  test(`${path}: 403 for non-admins, passes for admins`, async () => {
    for (const role of ['DOC', 'NUR', 'TEC', 'PAT']) {
      const res = await get(path, role);
      const body = await res.json();
      assert.equal(res.status, 403, `${role}`);
      assert.equal(body.message ?? body.error, 'Admin access required', `${role}`);
    }
    assert.notEqual((await get(path, 'ADM')).status, 403);
  });
}
