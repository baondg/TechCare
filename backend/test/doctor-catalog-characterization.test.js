/**
 * Characterization of the doctor-side catalog, dashboard and signature endpoints, plus the
 * active-visit gate every /api/doctor/patients/:patientId write passes through. Snapshot captured
 * before their SQL moved into repositories (G3 step B, doctor batch 1); see helpers/characterize.js.
 */

// Deterministic environment before the app loads: dashboard times are rendered in local time,
// and signatures are encrypted with IMAGE_ENCRYPTION_KEY.
process.env.TZ = 'UTC';
process.env.IMAGE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');
const { encryptField } = require('../dist/common/fieldEncryption');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'doctor-catalog-sql.snapshot.json');

const as = (role, userId) => () => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const DOCTOR = as('DOC', 21);
const TECHNICIAN = as('TEC', 31);
const NURSE = as('NUR', 41);
const PATIENT = as('PAT', 51);

const DOCTOR_ROW = [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]];

const SCENARIOS = [
  // ---- access
  ['patient is refused', 'GET', '/api/doctor/diseases', null, [], PATIENT],

  // ---- catalog
  ['diseases, all', 'GET', '/api/doctor/diseases', null, [[/FROM DISEASE/, [{ code: 'A00', description: 'Cholera' }]]], DOCTOR],
  ['diseases, search', 'GET', '/api/doctor/diseases?q=%20J06%20', null, [], NURSE],
  ['diseases, db down', 'GET', '/api/doctor/diseases', null, [[/./, dbError]], DOCTOR],
  ['medicines, search', 'GET', '/api/doctor/medicines?q=para', null, [[/FROM MEDICINE/, [{ id: 1, name: 'Paracetamol', unit: 'tablet' }]]], DOCTOR],
  ['medicines, db down', 'GET', '/api/doctor/medicines', null, [[/./, dbError]], DOCTOR],
  ['technicians', 'GET', '/api/doctor/technicians', null, [[/FROM TECHNICIAN te/, [{ technicianId: 3, technicianName: 'Tech Le' }]]], DOCTOR],
  ['technicians, db down', 'GET', '/api/doctor/technicians', null, [[/./, dbError]], DOCTOR],
  ['departments', 'GET', '/api/doctor/departments', null, [[/FROM DEPARTMENT/, [{ id: '2', name: ' ER ' }, { id: 3, name: null }]]], TECHNICIAN],
  ['departments, db down', 'GET', '/api/doctor/departments', null, [[/./, dbError]], DOCTOR],

  // ---- dashboard
  [
    'dashboard, doctor',
    'GET',
    '/api/doctor/dashboard/summary',
    null,
    [
      DOCTOR_ROW,
      [/FROM APPOINTMENT a WHERE a.doctor_id = :doctorId AND DATE/, [{ cnt: '3' }]],
      [/FROM TREATMENT t WHERE/, [{ cnt: 2 }]],
      [/FROM MEDICAL_PRESCRIPTION rx/, [{ cnt: 1 }]],
      [/COUNT\(DISTINCT tst.id\)/, [{ cnt: null }]],
      [/DATE\(a.time\) AS date/, [{ id: 9, date: '2026-10-07', time: '09:00:00', dbStatus: 'completed', department: '', room: null, patientId: '4', userId: '40', patientName: 'Binh' }, { id: 10, dbStatus: 'scheduled', patientId: 5, userId: 50, patientName: 'Chi' }]],
      [/MAX\(a.time\) AS lastTime/, [{ patientId: 4, userId: 40, patientName: 'Binh', lastTime: '2026-10-07T09:00:00.000Z' }]],
    ],
    DOCTOR,
  ],
  ['dashboard, user without doctor profile', 'GET', '/api/doctor/dashboard/summary', null, [], NURSE],
  [
    'dashboard, technician',
    'GET',
    '/api/doctor/dashboard/summary',
    null,
    [
      [/^SELECT technician_id FROM TECHNICIAN/, [{ technician_id: 8 }]],
      [/^SELECT COUNT\(\*\) AS cnt FROM TEST WHERE/, [{ cnt: 6 }]],
      [/COUNT\(DISTINCT tst.id\)/, [{ cnt: 2 }]],
      [/attachment_url IS NULL/, [{ cnt: '4' }]],
      [/LIMIT 12$/, [
        { labId: 1, testType: 'Blood', testTime: '2026-10-07T08:30:00.000Z', labResult: ' ', attachmentUrl: null, patientId: 4, patientName: 'Binh' },
        { labId: 2, testType: null, testTime: 'garbage', labResult: 'ok', attachmentUrl: null, patientId: 5, patientName: null },
      ]],
      [/LIMIT 8$/, [{ patientId: 4, patientName: 'Binh', lastTime: '2026-10-07T08:30:00.000Z' }]],
    ],
    TECHNICIAN,
  ],
  ['dashboard, technician without profile', 'GET', '/api/doctor/dashboard/summary', null, [], TECHNICIAN],
  ['dashboard, db down', 'GET', '/api/doctor/dashboard/summary', null, [[/./, dbError]], DOCTOR],

  // ---- signature
  ['signature, no doctor profile', 'GET', '/api/doctor/signature', null, [], DOCTOR],
  ['signature, none saved', 'GET', '/api/doctor/signature', null, [DOCTOR_ROW], DOCTOR],
  ['signature, encrypted', 'GET', '/api/doctor/signature', null, [
    DOCTOR_ROW,
    [/^SELECT signature FROM DOCTOR/, [{ signature: encryptField('data:image/png;base64,AAAA') }]],
  ], DOCTOR],
  ['signature, legacy plaintext', 'GET', '/api/doctor/signature', null, [
    DOCTOR_ROW,
    [/^SELECT signature FROM DOCTOR/, [{ signature: 'data:image/png;base64,BBBB' }]],
  ], DOCTOR],
  ['signature, unreadable', 'GET', '/api/doctor/signature', null, [
    DOCTOR_ROW,
    [/^SELECT signature FROM DOCTOR/, [{ signature: 'enc:v1:AAAA' }]],
  ], DOCTOR],
  ['signature, db down', 'GET', '/api/doctor/signature', null, [[/./, dbError]], DOCTOR],
  ['save signature, no doctor profile', 'PUT', '/api/doctor/signature', { signature: 'data:x' }, [], DOCTOR],
  ['save signature', 'PUT', '/api/doctor/signature', { signature: 'data:image/png;base64,CCCC' }, [DOCTOR_ROW], DOCTOR],
  ['clear signature', 'PUT', '/api/doctor/signature', { signature: '' }, [DOCTOR_ROW], DOCTOR],
  ['save signature, db down', 'PUT', '/api/doctor/signature', { signature: 'x' }, [DOCTOR_ROW, [/^UPDATE DOCTOR/, dbError]], DOCTOR],

  // ---- active-visit gate (doctor / technician writes under /patients/:patientId/*)
  ['gate: no open regimen blocks a doctor write', 'POST', '/api/doctor/patients/OP0007/not-a-route', {}, [
    [/WHERE user_id = :n/, [{ id: 70 }]],
  ], DOCTOR],
  ['gate: open regimen lets it through (then 404)', 'POST', '/api/doctor/patients/7/not-a-route', {}, [
    [/WHERE user_id = :n/, []],
    [/WHERE patient_id = :n/, [{ id: 7 }]],
    [/FROM REGIMEN/, [{ id: 99 }]],
  ], TECHNICIAN],
  ['gate: unknown patient passes through', 'PUT', '/api/doctor/patients/abc/not-a-route', {}, [], DOCTOR],
  ['gate: nurse is not gated', 'POST', '/api/doctor/patients/7/not-a-route', {}, [], NURSE],
  ['gate: reads are not gated', 'GET', '/api/doctor/patients/7/not-a-route', null, [], DOCTOR],
  ['gate: health-info is not gated', 'DELETE', '/api/doctor/patients/7/health-info/1/not-a-route', null, [], DOCTOR],
  ['gate: db down', 'POST', '/api/doctor/patients/7/not-a-route', {}, [[/./, dbError]], DOCTOR],
];

function scrubValue(key, value) {
  if (key === 'signature' && typeof value === 'string' && value.startsWith('enc:v1:') && value.length > 20) {
    return '<encrypted>';
  }
  return undefined;
}

characterize('doctor catalog / dashboard / signature / active-visit gate: same SQL, same answers', SNAPSHOT, SCENARIOS, {
  scrubValue,
});
