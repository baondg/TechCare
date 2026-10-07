/** Bộ Y tế e-prescription code helpers (services/emr/bytPrescription). */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const byt = require(path.join(__dirname, '..', 'dist', 'services', 'emr', 'bytPrescription'));

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

function fakeSequelize(collisions) {
  const calls = [];
  return {
    calls,
    async query(_sql, opts) {
      calls.push(opts.replacements.needle);
      return calls.length <= collisions ? [{ order_id: 1 }] : [];
    },
  };
}

test('generateUniqueBytPrescriptionCode normalises facility/type and retries on collision', async () => {
  const db = fakeSequelize(2);
  const code = await byt.generateUniqueBytPrescriptionCode(db, { facilityCode: 'ab-1', type: 'h' });
  assert.match(code, /^AB100[a-z0-9]{7}-H$/);
  assert.equal(byt.isBytCodeShape(code), true);
  assert.equal(db.calls.length, 3);
});

test('generateUniqueBytPrescriptionCode gives up after 20 collisions', async () => {
  await assert.rejects(
    byt.generateUniqueBytPrescriptionCode(fakeSequelize(Infinity), { facilityCode: 'TC001', type: 'C' }),
    /Unable to generate unique BYT prescription code/
  );
});
