const test = require('node:test');
const assert = require('node:assert/strict');

const { RBAC_MATRIX, isRoleAllowed } = require('../dist/security/rbacMatrix');
const { authorizeCapability } = require('../dist/middleware/authorizeCapability');
const { normalizeRoleFromCode } = require('../dist/security/roleMapping');
const contract = require('../dist/config/systemConfigurationContract');

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

test('system config contract: every rate-limit scope reads keys that have a default', () => {
  for (const [scope, { requestsKey, windowSecondsKey }] of Object.entries(contract.RATE_LIMIT_SCOPE_TO_KEYS)) {
    assert.ok(requestsKey in contract.CONFIG_DEFAULTS, `${scope}: ${requestsKey}`);
    assert.ok(windowSecondsKey in contract.CONFIG_DEFAULTS, `${scope}: ${windowSecondsKey}`);
  }
  assert.equal(contract.RATE_LIMIT_SCOPE_TO_KEYS.aiRecovery.requestsKey, 'aiSymptomRateLimitRequests');
});

test('system config contract: getRateLimitQueryKeysForScope', () => {
  const keys = contract.getRateLimitQueryKeysForScope('login');
  assert.ok(keys.includes('rateLimitEnabled'));
  assert.ok(keys.includes('loginRateLimitRequests'));
  assert.ok(keys.includes('loginRateLimitWindowSeconds'));
});

test('system config contract: buildRateLimitPolicyFromKvMap honors overrides', () => {
  const map = {
    ...contract.CONFIG_DEFAULTS,
    rateLimitEnabled: 'false',
    rateLimitIpBased: 'false',
    globalRateLimitRequests: '200',
    globalRateLimitWindowSeconds: '120',
  };
  const p = contract.buildRateLimitPolicyFromKvMap(map, 'global', { maxRequests: 100, windowSeconds: 60 });
  assert.equal(p.enabled, false);
  assert.equal(p.ipBasedLimit, false);
  assert.equal(p.maxRequests, 200);
  assert.equal(p.windowSeconds, 120);
});

test('system config contract: buildRateLimitPolicyFromKvMap fallback defaults', () => {
  const map = { rateLimitEnabled: 'true', rateLimitIpBased: 'true' };
  const p = contract.buildRateLimitPolicyFromKvMap(map, 'login', { maxRequests: 99, windowSeconds: 77 });
  assert.equal(p.maxRequests, 99);
  assert.equal(p.windowSeconds, 77);
});

test('cover requests are doctor-only (admins have no doctor profile to cover with)', () => {
  assert.equal(isRoleAllowed('doctor.cover.manage', 'doctor'), true);
  for (const role of ['admin', 'nurse', 'technician', 'patient']) {
    assert.equal(isRoleAllowed('doctor.cover.manage', role), false, role);
  }
});

test('system config contract: defaults and validation rules describe the same keys', () => {
  for (const key of Object.keys(contract.NUMERIC_CONFIG_RULES)) {
    assert.ok(key in contract.CONFIG_DEFAULTS, `${key} has a rule but no default`);
    const { min, max } = contract.NUMERIC_CONFIG_RULES[key];
    const value = Number(contract.CONFIG_DEFAULTS[key]);
    assert.ok(value >= min && value <= max, `${key} default ${value} outside ${min}..${max}`);
  }
  for (const key of contract.BOOLEAN_CONFIG_KEYS) assert.ok(key in contract.CONFIG_DEFAULTS, key);
});

test('system config contract: appointment rate-limit default matches the middleware fallback (60 / 60s)', () => {
  assert.equal(contract.CONFIG_DEFAULTS.appointmentRateLimitRequests, '60');
  assert.equal(contract.CONFIG_DEFAULTS.appointmentRateLimitWindowSeconds, '60');
});

test('AI capabilities: model info is admin-only, clinical assistants are for doctors and admins', () => {
  assert.equal(isRoleAllowed('ai.models.inspect', 'admin'), true);
  assert.equal(isRoleAllowed('ai.models.inspect', 'doctor'), false);
  for (const role of ['doctor', 'admin']) assert.equal(isRoleAllowed('ai.clinical.assist', role), true, role);
  for (const role of ['nurse', 'technician', 'patient']) assert.equal(isRoleAllowed('ai.clinical.assist', role), false, role);
});

test('authorizeCapability can carry a custom message (in both error and message)', () => {
  const guard = authorizeCapability('ai.models.inspect', { message: 'Admin access required' });
  const res = createMockRes();
  guard({ user: { role: 'doctor' } }, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'Admin access required');
  assert.equal(res.payload.message, 'Admin access required');
  assert.equal(res.payload.capability, 'ai.models.inspect');
});
