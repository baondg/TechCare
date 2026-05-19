const test = require('node:test');
const assert = require('node:assert/strict');

const { isRecoveryEligiblePrescriptionRow } = require('../src/repositories/appointmentAiRepository');

test('recovery eligibility: no row / empty ok is not eligible', () => {
  assert.equal(isRecoveryEligiblePrescriptionRow(undefined), false);
  assert.equal(isRecoveryEligiblePrescriptionRow(null), false);
  assert.equal(isRecoveryEligiblePrescriptionRow({}), false);
  assert.equal(isRecoveryEligiblePrescriptionRow({ ok: 0 }), false);
  assert.equal(isRecoveryEligiblePrescriptionRow({ ok: null }), false);
});

test('recovery eligibility: MySQL-style ok=1 from SELECT 1 AS ok', () => {
  assert.equal(isRecoveryEligiblePrescriptionRow({ ok: 1 }), true);
});

test('recovery eligibility: truthy ok values count as eligible', () => {
  assert.equal(isRecoveryEligiblePrescriptionRow({ ok: '1' }), true);
});
