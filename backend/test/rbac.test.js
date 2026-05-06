const test = require('node:test');
const assert = require('node:assert/strict');

const { RBAC_MATRIX, isRoleAllowed } = require('../src/security/rbacMatrix');
const { authorizeCapability } = require('../src/middleware/authorizeCapability');
const { normalizeRoleFromCode } = require('../src/security/roleMapping');

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test('RBAC matrix includes core capabilities', () => {
  assert.ok(RBAC_MATRIX['doctor.emr.read']);
  assert.ok(RBAC_MATRIX['appointments.write.self']);
  assert.ok(RBAC_MATRIX['appointments.nurse.checkin']);
});

test('allow path: patient can write own appointments', () => {
  assert.equal(isRoleAllowed('appointments.write.self', 'patient'), true);
});

test('deny path: patient cannot access nurse check-in capability', () => {
  assert.equal(isRoleAllowed('appointments.nurse.checkin', 'patient'), false);
});

test('role mapping normalizes role code variants for RBAC', () => {
  assert.equal(normalizeRoleFromCode('DOC'), 'doctor');
  assert.equal(normalizeRoleFromCode('TEC'), 'technician');
  assert.equal(normalizeRoleFromCode('PHY'), 'technician');
  assert.equal(normalizeRoleFromCode('nurse'), 'nurse');
});

test('middleware allows authorized role', () => {
  const guard = authorizeCapability('doctor.emr.read');
  const req = { user: { role: 'doctor' } };
  const res = createMockRes();
  let called = false;
  guard(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('middleware denies unauthorized role', () => {
  const guard = authorizeCapability('appointments.write.self');
  const req = { user: { role: 'doctor' } };
  const res = createMockRes();
  let called = false;
  guard(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload?.capability, 'appointments.write.self');
});

test('middleware permits mapped technician role for doctor.emr.read', () => {
  const guard = authorizeCapability('doctor.emr.read');
  const req = { user: { role: normalizeRoleFromCode('PHY') } };
  const res = createMockRes();
  let called = false;
  guard(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('matrix has explicit allow/deny behavior for every capability and role', () => {
  const roles = ['doctor', 'admin', 'nurse', 'technician', 'patient'];
  for (const [capability, allowedRoles] of Object.entries(RBAC_MATRIX)) {
    for (const role of roles) {
      const expected = allowedRoles.includes(role);
      assert.equal(
        isRoleAllowed(capability, role),
        expected,
        `capability=${capability} role=${role} expected=${expected}`
      );
    }
  }
});

test('middleware denies when role is missing', () => {
  const guard = authorizeCapability('doctor.emr.read');
  const req = { user: {} };
  const res = createMockRes();
  let called = false;
  guard(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});
