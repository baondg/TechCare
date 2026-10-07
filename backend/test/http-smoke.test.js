/**
 * HTTP smoke tests that need no database: health, 404, and the auth guard on
 * every protected router. A refactor that drops `authenticateToken` from a
 * router (or reorders middleware so a handler runs first) fails here.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer } = require('./helpers/app');

let server;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
});

test('GET /health returns ok', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('unknown /api route returns 404', async () => {
  const res = await fetch(`${server.baseUrl}/api/does-not-exist`);
  assert.equal(res.status, 404);
});

/** One representative endpoint per protected router. */
const PROTECTED_ENDPOINTS = [
  ['GET', '/api/doctor/patients'],
  ['GET', '/api/doctor/diseases'],
  ['POST', '/api/doctor/patients/1/diagnoses'],
  ['GET', '/api/admin/accounts'],
  ['GET', '/api/profile/1'],
  ['GET', '/api/health-info/1'],
  ['GET', '/api/notifications'],
  ['GET', '/api/work-shifts'],
  ['GET', '/api/cover/requests'],
  ['PUT', '/api/cover/1/accept'],
];

for (const [method, path] of PROTECTED_ENDPOINTS) {
  test(`${method} ${path} without a token is rejected with 401 NO_TOKEN`, async () => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'NO_TOKEN');
  });
}
