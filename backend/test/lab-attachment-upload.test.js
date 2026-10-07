/**
 * POST /api/doctor/lab-attachments carries the file as base64 inside JSON, so it needs a bigger body
 * than the app-wide 100 kB JSON limit. That body is parsed only after authentication.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { startTestServer } = require('./helpers/app');
const { installFakeDb, accessToken } = require('./helpers/fakeDb');

const UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'techcare-lab-upload-'));
let server;
let db;

test.before(async () => {
  process.chdir(UPLOAD_ROOT);
  db = installFakeDb();
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
  db?.restore();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

const TECH = `Bearer ${accessToken({ userId: 61, role: 'TEC', username: 'tec61' })}`;
const MB = 1024 * 1024;

function upload(bytes, authorization = TECH) {
  const headers = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  return fetch(`${server.baseUrl}/api/doctor/lab-attachments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileName: 'ket-qua.pdf', mimeType: 'application/pdf', dataBase64: bytes.toString('base64') }),
  });
}

test('a 2 MB PDF is saved byte for byte', async () => {
  const bytes = Buffer.alloc(2 * MB, 7);
  const res = await upload(bytes);
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.match(body.fileUrl, /^\/uploads\/lab\/lab_\d+_[a-z0-9]+\.pdf$/);
  assert.deepEqual(fs.readFileSync(path.join(UPLOAD_ROOT, body.fileUrl)), bytes);
});

test('files over 15 MB get the handler\'s own 400, not a 413', async () => {
  const res = await upload(Buffer.alloc(15.5 * MB, 1));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, 'File too large (max 15MB)');
});

test('without a token the upload is rejected before its body is parsed', async () => {
  const res = await upload(Buffer.alloc(2 * MB, 1), null);
  assert.equal(res.status, 401);
});

test('other routes keep the 100 kB JSON limit', async () => {
  const res = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'x', password: 'y'.repeat(200 * 1024) }),
  });
  assert.equal(res.status, 413);
});
