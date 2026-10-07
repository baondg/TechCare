/** Bộ Y tế e-prescription code helpers (services/emr/bytPrescription). */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const byt = require(path.join(__dirname, '..', 'dist', 'services', 'emr', 'bytPrescription'));
const prescriptionRepository = require(path.join(__dirname, '..', 'dist', 'repositories', 'prescriptionRepository'));

test('isBytCodeShape: 5 facility chars + 7 lowercase base36 + -N|H|C', () => {
  assert.equal(byt.isBytCodeShape('TC001abc1234-C'), true);
  assert.equal(byt.isBytCodeShape('TC001ABC1234-C'), false);
  assert.equal(byt.isBytCodeShape('TC001abc1234-X'), false);
  assert.equal(byt.isBytCodeShape(null), false);
});

test('prescription meta note round-trips and tolerates legacy plain-text notes', () => {
  const note = byt.buildPrescriptionMetaNote({ department: 'Nội tổng quát', byt: { code: 'TC001abc1234-C' } });
  assert.deepEqual(byt.parsePrescriptionMetaNote(note), {
    department: 'Nội tổng quát',
    byt: { code: 'TC001abc1234-C' },
  });
  assert.deepEqual(byt.parsePrescriptionMetaNote('Khoa Nhi'), { department: 'Khoa Nhi', byt: null });
  assert.deepEqual(byt.parsePrescriptionMetaNote(''), { department: '', byt: null });
  assert.deepEqual(byt.parsePrescriptionMetaNote('42'), { department: '42', byt: null });
});

/** Stubs the "code already stored?" lookup: the first `collisions` candidates are taken. */
function stubCodeLookup(t, collisions) {
  const tried = [];
  t.mock.method(prescriptionRepository, 'bytCodeInUse', async (code) => {
    tried.push(code);
    return tried.length <= collisions;
  });
  return tried;
}

test('generateUniqueBytPrescriptionCode normalises facility/type and retries on collision', async (t) => {
  const tried = stubCodeLookup(t, 2);
  const code = await byt.generateUniqueBytPrescriptionCode({ facilityCode: 'ab-1', type: 'h' });
  assert.match(code, /^AB100[a-z0-9]{7}-H$/);
  assert.equal(byt.isBytCodeShape(code), true);
  assert.equal(tried.length, 3);
  assert.equal(tried[2], code);
});

test('generateUniqueBytPrescriptionCode gives up after 20 collisions', async (t) => {
  const tried = stubCodeLookup(t, Infinity);
  await assert.rejects(
    byt.generateUniqueBytPrescriptionCode({ facilityCode: 'TC001', type: 'C' }),
    /Unable to generate unique BYT prescription code/
  );
  assert.equal(tried.length, 20);
});

test('normalizeBytPrescriptionType: N / H case-insensitive, anything else C', () => {
  assert.equal(byt.normalizeBytPrescriptionType('n'), 'N');
  assert.equal(byt.normalizeBytPrescriptionType('H'), 'H');
  assert.equal(byt.normalizeBytPrescriptionType('x'), 'C');
  assert.equal(byt.normalizeBytPrescriptionType(undefined), 'C');
});
