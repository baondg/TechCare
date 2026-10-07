const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const { validate } = require(path.join(DIST, 'middleware', 'validate'));
const { asyncHandler } = require(path.join(DIST, 'common', 'asyncHandler'));
const { coverIdParams, createCoverRequestBody } = require(path.join(DIST, 'validators', 'coverSchemas'));

function runMiddleware(mw, req) {
  let nextArg = 'not-called';
  mw(req, {}, (arg) => {
    nextArg = arg;
  });
  return nextArg;
}

test('validate coerces params and replaces them with parsed values', () => {
  const req = { params: { id: '42' }, query: {}, body: {} };
  const result = runMiddleware(validate({ params: coverIdParams }), req);
  assert.equal(result, undefined);
  assert.equal(req.params.id, 42);
});

test('validate rejects with a 400 VALIDATION_ERROR listing every issue', () => {
  const req = { params: { id: 'abc' }, query: {}, body: { appointmentIds: [] } };
  const err = runMiddleware(validate({ params: coverIdParams, body: createCoverRequestBody }), req);
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.message, 'Invalid id');
  assert.deepEqual(
    err.details.map((d) => d.path),
    ['params.id', 'body.appointmentIds']
  );
});

test('createCoverRequestBody keeps the legacy error message and strips unknown keys', () => {
  assert.equal(createCoverRequestBody.safeParse({}).error.issues[0].message, 'appointmentIds array is required');
  const ok = createCoverRequestBody.parse({ appointmentIds: ['7', 8], reason: '  On leave ', extra: 1 });
  assert.deepEqual(ok, { appointmentIds: [7, 8], reason: 'On leave' });
});

test('validate mutates req.query in place (Express may expose it via a getter)', () => {
  const { z } = require('zod');
  const query = { page: '2', junk: 'x' };
  const req = { params: {}, query, body: {} };
  runMiddleware(validate({ query: z.object({ page: z.coerce.number() }) }), req);
  assert.equal(req.query, query);
  assert.deepEqual(query, { page: 2 });
});

test('asyncHandler forwards rejections to next()', async () => {
  const boom = new Error('boom');
  let forwarded;
  await new Promise((resolve) => {
    asyncHandler(async () => {
      throw boom;
    })({}, {}, (err) => {
      forwarded = err;
      resolve();
    });
  });
  assert.equal(forwarded, boom);
});
