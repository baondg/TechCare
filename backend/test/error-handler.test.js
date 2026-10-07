const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const { errorHandler, notFoundHandler } = require(path.join(DIST, 'middleware', 'errorHandler'));
const { AppError, BadRequestError, NotFoundError } = require(path.join(DIST, 'errors', 'AppError'));
const { startTestServer } = require('./helpers/app');

function run(handler, err, req = {}) {
  const res = {
    headersSent: false,
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
  const fullReq = { requestId: 'req-test-1', method: 'GET', path: '/x', ...req };
  if (handler === notFoundHandler) handler(fullReq, res);
  else handler(err, fullReq, res, () => {});
  return res;
}

test('AppError subclasses map to their status, message and code', () => {
  const res = run(errorHandler, new BadRequestError('date query param required'));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, {
    success: false,
    error: 'date query param required',
    message: 'date query param required',
    code: 'BAD_REQUEST',
    requestId: 'req-test-1',
  });
  assert.equal(run(errorHandler, new NotFoundError('Patient not found')).statusCode, 404);
});

test('legacy errors with statusCode 4xx keep their status and message', () => {
  const err = Object.assign(new Error('Invalid id'), { statusCode: 400 });
  const res = run(errorHandler, err);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, 'Invalid id');
});

test('unexpected errors return a generic 500 without leaking the message', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = run(errorHandler, new Error("ER_NO_SUCH_TABLE: Table 'techcare.PATIENT' doesn't exist"));
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.message, 'Internal Server Error');
  assert.equal(res.payload.error, 'Internal Server Error');
  assert.equal(res.payload.requestId, 'req-test-1');
});

test('AppError with a 5xx status is logged and does not expose a generic 500 message', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = run(errorHandler, new AppError('db exploded: password=hunter2', 500));
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.message, 'Internal Server Error');
});

test('notFoundHandler answers JSON', () => {
  const res = run(notFoundHandler, null, { method: 'GET', path: '/api/nope' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.code, 'ROUTE_NOT_FOUND');
});

test('malformed JSON body is a 400, not a 500', async () => {
  const server = await startTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username": ',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(body.requestId, res.headers.get('x-request-id'));
  } finally {
    await server.close();
  }
});
