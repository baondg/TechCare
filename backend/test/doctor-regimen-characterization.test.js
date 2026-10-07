/**
 * Characterization of the visit (REGIMEN) endpoints under /api/doctor/patients/:patientId: active
 * visit + check-in room, close visit, health tracking / follow-up re-exam slips, documents of the
 * open visit, completed-visit history and transfers. Snapshot captured before their SQL moved into
 * repositories (G3 step B, doctor batch 5).
 */
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'doctor-regimen-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const DOCTOR = as('DOC', 21);
const NURSE = as('NUR', 41);
const ADMIN = as('ADM', 1);

const unknownColumn = () =>
  Object.assign(new Error('Unknown column duration'), { original: { code: 'ER_BAD_FIELD_ERROR' } });

/** Route OP0070 → patient 7: canonical resolver (user id first) and the user-or-pk resolver. */
const RESOLVE_70 = [/^SELECT patient_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1$/, [{ id: 7 }]];
const BY_ROUTE = [/WHERE user_id = :v OR patient_id = :v/, [{ patient_id: 7 }]];
/** Active-visit gate for doctor / technician writes. */
const GATE_OPEN = [/^SELECT id FROM REGIMEN WHERE patient_id = :pid AND `end` IS NULL ORDER BY `start` DESC, id DESC LIMIT 1$/, [{ id: 99 }]];
const NEW_TREATMENT = [
  [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]],
  [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 300 }]],
  [/^SELECT id FROM REGIMEN WHERE patient_id = :patientId AND `end` IS NULL ORDER BY id DESC/, [{ id: 99 }]],
  [/^INSERT INTO TREATMENT/, [501, 1]],
];
const NEW_ORDER = [/^INSERT INTO `ORDER`/, [601, 1]];
/** Latest open visit as the slips read it (with or without its start column). */
const SLIP_OPEN_VISIT = /^SELECT id AS regimenId(, `start` AS startAt)? FROM REGIMEN/;
/** Every open visit, as "close" reads it; rows carry both column spellings. */
const CLOSE_OPEN_VISITS = /^SELECT id( AS regimenId, `start` AS regimenStart)? FROM REGIMEN WHERE patient_id = :pid AND `end` IS NULL ORDER BY `start` DESC, id DESC$/;
const openVisitRows = (...ids) => ids.map((id) => ({ id, regimenId: id }));

// ---- active visit + check-in room
const OPEN_REGIMEN = [/^SELECT id AS regimenId, `start` AS startAt FROM REGIMEN/, [{ regimenId: '99', startAt: '2026-10-01T08:00:00.000Z' }]];
const room = (re, rows) => [re, rows];
const LINKED = /AND a.regimen_id = :regimenId LIMIT 1$/;
const CLOSEST = /INNER JOIN REGIMEN r ON r.patient_id = a.patient_id AND r.id = :regimenId/;
const BY_START_DATE = /DATE\(a.time\) = DATE\(:regimenStart\)/;
const BY_TODAY = /DATE\(a.time\) = CURDATE\(\)/;
const BY_WINDOW = /INTERVAL 5 DAY/;
const BY_36H = /INTERVAL 36 HOUR/;
const BY_TREATMENT = /FROM TREATMENT t LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id/;

// ---- documents / history
const OPEN_REGIMENS = [/^SELECT id AS regimenId, `start` AS regimenStart FROM REGIMEN/, [
  { regimenId: 99, regimenStart: '2026-10-01T08:00:00.000Z' },
  { regimenId: '98', regimenStart: '2026-09-30T08:00:00.000Z' },
  { regimenId: 'x' },
]];
const BYT_META = JSON.stringify({ v: 2, department: 'Cardiology', byt: { code: 'TC001fixed01-C', prescriptionType: 'n', facilityName: 'Old clinic' } });
const RX_ROWS = [
  { treatmentId: 501, orderId: 601, prescribedAt: '2026-10-01T09:00:00.000Z', prescriptionNote: BYT_META, prescriptionDuration: 10, medNo: 1, name: 'Paracetamol', quantity: 10, usageText: 'After meals', frequency: 'After meals', unit: 'tablet', medNote: 'n', lineDuration: 5 },
  { treatmentId: 501, orderId: 601, prescribedAt: '2026-10-01T09:00:00.000Z', prescriptionNote: BYT_META, prescriptionDuration: 10, medNo: 2, name: 'Syrup', quantity: null, usageText: null, frequency: null, unit: null, lineDuration: null },
  { treatmentId: 502, orderId: 602, prescribedAt: null, prescriptionNote: 'Khoa Nhi', medNo: null, name: null },
  { treatmentId: null, orderId: 603, prescribedAt: '2026-10-01T10:00:00.000Z', prescriptionNote: '', medNo: 1, name: 'Orphan', quantity: 1 },
];
const LAB_ROWS = [
  { treatmentId: 501, id: 701, testId: 701, testAt: '2026-10-01T09:30:00.000Z', testType: 'CBC', resultSummary: 'ok', note: null, fileUrl: null, technicianName: 'Lan' },
  { treatmentId: 502, id: 702, testId: 702, testAt: '2026-10-01T09:40:00.000Z', testType: 'X-ray', resultSummary: null, note: 'n', fileUrl: '/uploads/lab/x.png', technicianName: null },
];
const SURGERY_ROWS = [
  { treatmentId: 502, id: 801, orderId: 801, surgeryType: 'Day Surgery', start: '2026-10-01T11:00:00.000Z', end: '2026-10-01T12:00:00.000Z', result: null, surgeon: 12, note: null, urgency: 'LOW' },
];
const TRANSFER_ROWS = [
  { regimenId: 99, orderId: '901', reason: 'Needs ICU', transferAt: '2026-10-01T12:00:00.000Z', note: null, toHospitalId: 7, toHospitalName: 'Cho Ray', transport: 'ambulance', formPayload: '{"bp":"120/80"}' },
  { regimenId: 98, orderId: 902, reason: null, transferAt: '2026-09-30T12:00:00.000Z', note: 'n', toHospitalId: null, toHospitalName: null, transport: null, formPayload: { already: 'object' } },
  { regimenId: 'x', orderId: 903, reason: 'r', formPayload: 'not json' },
];
const TREATMENT_ROWS = [
  { treatmentId: 501, regimenId: 99, visitAt: '2026-10-01T08:30:00.000Z', department: 'Outpatient', complaint: 'Cough', icd10: 'J06', interpretation: 'URI', doctorName: 'Hoa Tran', roomName: 'R1' },
  { treatmentId: 502, regimenId: 99, visitAt: '2026-10-01T09:00:00.000Z', department: 'Lab', complaint: ' ', icd10: null, interpretation: null, doctorName: 'Le An', roomName: null },
  { treatmentId: 503, regimenId: 98, visitAt: '2026-09-30T09:00:00.000Z', department: null, complaint: 'Fever', icd10: null, interpretation: null, doctorName: 'Hoa Tran', roomName: null },
];
const DOCUMENT_RULES = [
  BY_ROUTE,
  OPEN_REGIMENS,
  // The open-visit query selects no regimenId (history's does).
  [/AS doctorName, cr.name AS roomName FROM TREATMENT t/, TREATMENT_ROWS.map(({ regimenId: _r, ...row }) => row)],
  [/AS diagnosedAt/, [{ id: 501, diagnosedAt: '2026-10-01T08:30:00.000Z', complaint: 'Cough', icd10: 'J06', interpretation: 'URI', department: 'Cardiology' }]],
  [/FROM MEDICAL_PRESCRIPTION rx/, RX_ROWS],
  [/FROM TEST tst/, LAB_ROWS],
  [/FROM SURGERY s/, SURGERY_ROWS],
  [/JOIN TRANSFERENCE tr ON tr.order_id = o.id/, TRANSFER_ROWS],
  [/p.type = 'HEALTH_TRACKING_SLIP'/, [
    { orderId: 611, createdAt: '2026-10-01T10:00:00.000Z', createdByDoctor: 'Hoa Tran', payload: JSON.stringify({ version: 1, rows: [{ id: '3', time: '2026-10-01T07:00:00.000Z', bloodPressure: '120/80', pulse: '72', spo2: 'x' }, null] }) },
    { orderId: 612, createdAt: '2026-10-01T11:00:00.000Z', createdByDoctor: null, payload: 'broken' },
  ]],
  [/p.type = 'FOLLOW_UP_REEXAM_SLIP'/, [
    { orderId: 621, createdAt: '2026-10-01T12:00:00.000Z', payload: { patientName: 'Bao', date: '2026-10-15' } },
    { orderId: 622, createdAt: '2026-10-01T12:30:00.000Z', payload: '"just a string"' },
    { orderId: 0, createdAt: '2026-10-01T12:40:00.000Z', payload: '{}' },
  ]],
];
const HISTORY_REGIMENS = [/WHERE r.patient_id = :patientId AND r.end IS NOT NULL/, [
  { regimenId: 99, regimenStart: '2026-10-01T08:00:00.000Z', regimenEnd: '2026-10-01T13:00:00.000Z', icd10: 'Z00.0', diseaseDescription: 'General examination' },
  { regimenId: '98', regimenStart: '2026-09-30T08:00:00.000Z', regimenEnd: '2026-09-30T13:00:00.000Z', icd10: 'R50', diseaseDescription: 'Fever' },
  { regimenId: 97, regimenStart: '2026-09-01T08:00:00.000Z', regimenEnd: '2026-09-01T09:00:00.000Z', icd10: null, diseaseDescription: null },
]];

const SLIP = { patientName: 'Bao Do', reexamDate: '2026-10-15', note: 'fasting' };
const TRANSFER = { kind: 'Clinic', reason: ' Cardiology review ', note: ' bring ECG ', fromRoomId: 1, toRoomId: '4' };

const SCENARIOS = [
  // ---- active visit + check-in room
  ['active, bad patient', 'GET', '/api/doctor/patients/OPxyz/regimen/active', null, [], () => NURSE],
  ['active, no visit, nothing today', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [RESOLVE_70], () => NURSE],
  ['active, unknown patient falls back to the number, room booked today', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    room(BY_TODAY, [{ roomId: '2', roomName: '' }]),
  ], () => NURSE],
  ['active, room from appointment linked to the visit', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(LINKED, [{ roomId: 3, roomName: 'R3' }]),
  ], () => DOCTOR],
  ['active, closest appointment to the visit start', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(LINKED, [{ roomId: null }]), room(CLOSEST, [{ roomId: '5', roomName: null }]),
  ], () => DOCTOR],
  ['active, appointment on the visit date', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(BY_START_DATE, [{ roomId: 6, roomName: 'R6' }]),
  ], () => DOCTOR],
  ['active, appointment within 5 days', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(BY_WINDOW, [{ roomId: 7, roomName: 'R7' }]),
  ], () => DOCTOR],
  ['active, appointment within 36 hours', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(BY_36H, [{ roomId: 8, roomName: 'R8' }]),
  ], () => DOCTOR],
  ['active, room from the first treatment', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [
    RESOLVE_70, OPEN_REGIMEN, room(BY_TREATMENT, [{ roomId: 9, roomName: null }]),
  ], () => DOCTOR],
  ['active, open visit without a room', 'GET', '/api/doctor/patients/7/regimen/active', null, [
    RESOLVE_70, [/^SELECT id AS regimenId, `start` AS startAt FROM REGIMEN/, [{ regimenId: 99, startAt: null }]],
  ], () => DOCTOR],
  ['active, db down', 'GET', '/api/doctor/patients/OP0070/regimen/active', null, [RESOLVE_70, [/FROM REGIMEN/, dbError]], () => DOCTOR],

  // ---- close visit
  ['close, nurse is not allowed', 'POST', '/api/doctor/patients/OP0070/regimen/close', null, [RESOLVE_70], () => NURSE],
  ['close, doctor gate: no active visit', 'POST', '/api/doctor/patients/OP0070/regimen/close', null, [RESOLVE_70], () => DOCTOR],
  ['close, bad patient', 'POST', '/api/doctor/patients/OPxyz/regimen/close', null, [], () => ADMIN],
  ['close, nothing open', 'POST', '/api/doctor/patients/OP0070/regimen/close', null, [RESOLVE_70], () => ADMIN],
  ['close, every open visit', 'POST', '/api/doctor/patients/OP0070/regimen/close', null, [
    RESOLVE_70, GATE_OPEN,
    [CLOSE_OPEN_VISITS, openVisitRows('99', 98, 'x', 0)],
  ], () => DOCTOR],
  ['close, db down', 'POST', '/api/doctor/patients/OP0070/regimen/close', null, [
    RESOLVE_70, [CLOSE_OPEN_VISITS, openVisitRows(99)], [/^UPDATE REGIMEN/, dbError],
  ], () => ADMIN],

  // ---- health tracking slip
  ['tracking slip, nurse is not allowed', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [], () => NURSE],
  ['tracking slip, unknown patient', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [], () => ADMIN],
  ['tracking slip, no open visit', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [BY_ROUTE], () => ADMIN],
  ['tracking slip, no record ids', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: ['x', -1] }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]],
  ], () => ADMIN],
  ['tracking slip, records not found', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]],
  ], () => ADMIN],
  ['tracking slip, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]], [/FROM MEDICAL_RECORD/, [{ id: 3 }]],
  ], () => ADMIN],
  ['tracking slip, saved', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', {
    recordIds: [3, '4', 3, 0, 'x'], ms: ' MS-1 ', admissionNo: 12, note: null,
  }, [
    BY_ROUTE, GATE_OPEN,
    [SLIP_OPEN_VISIT, [{ regimenId: '99' }]],
    [/FROM MEDICAL_RECORD/, [
      { id: '3', time: '2026-10-01T07:00:00.000Z', condition: 'cough', blood_pressure: '120/80', heart_rate: '72', temperature: 37.2, weight: null, respiratory_rate: 18, spo2: 'x' },
      { id: 4, time: '2026-10-01T09:00:00.000Z', condition: null, blood_pressure: null },
    ]],
    ...NEW_TREATMENT, NEW_ORDER,
  ], () => DOCTOR],
  ['tracking slip, order insert without id', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]], [/FROM MEDICAL_RECORD/, [{ id: 3 }]], ...NEW_TREATMENT,
  ], () => ADMIN],
  ['tracking slip, db down', 'POST', '/api/doctor/patients/OP0070/health-tracking-slips', { recordIds: [3] }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, dbError],
  ], () => ADMIN],

  // ---- follow-up re-exam slip
  ['reexam slip, nurse is not allowed', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [], () => NURSE],
  ['reexam slip, unknown patient', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [], () => ADMIN],
  ['reexam slip, no open visit', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [BY_ROUTE], () => ADMIN],
  ['reexam slip, no slip', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: 'x' }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]],
  ], () => ADMIN],
  ['reexam slip, no patient name', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: { patientName: ' ' } }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]],
  ], () => ADMIN],
  ['reexam slip, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]],
  ], () => ADMIN],
  ['reexam slip, saved', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [
    BY_ROUTE, GATE_OPEN, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]], ...NEW_TREATMENT, NEW_ORDER,
  ], () => DOCTOR],
  ['reexam slip, order insert without id', 'POST', '/api/doctor/patients/OP0070/follow-up-reexam-slip', { slip: SLIP }, [
    BY_ROUTE, [SLIP_OPEN_VISIT, [{ regimenId: 99 }]], ...NEW_TREATMENT,
  ], () => ADMIN],

  // ---- documents of the open visit
  ['documents, bad patient', 'GET', '/api/doctor/patients/OPxyz/regimen/active/documents', null, [], () => NURSE],
  ['documents, no open visit', 'GET', '/api/doctor/patients/OP0070/regimen/active/documents', null, [BY_ROUTE], () => NURSE],
  ['documents, only junk regimen ids', 'GET', '/api/doctor/patients/OP0070/regimen/active/documents', null, [
    BY_ROUTE, [/^SELECT id AS regimenId, `start` AS regimenStart FROM REGIMEN/, [{ regimenId: 'x' }]],
  ], () => NURSE],
  ['documents, every section', 'GET', '/api/doctor/patients/OP0070/regimen/active/documents', null, DOCUMENT_RULES, () => DOCTOR],
  ['documents, legacy prescription schema', 'GET', '/api/doctor/patients/OP0070/regimen/active/documents', null, [
    BY_ROUTE,
    OPEN_REGIMENS,
    [/COALESCE\(pd.duration, 7\)/, unknownColumn],
    [/FROM MEDICAL_PRESCRIPTION rx/, [{ treatmentId: 501, orderId: 601, prescribedAt: null, prescriptionNote: null, medNo: 1, name: 'A', quantity: 2, usageText: 'u', frequency: 'u', unit: 'tablet' }]],
  ], () => DOCTOR],
  ['documents, db down', 'GET', '/api/doctor/patients/OP0070/regimen/active/documents', null, [BY_ROUTE, OPEN_REGIMENS, [/FROM TEST tst/, dbError]], () => DOCTOR],

  // ---- completed visits
  ['history, bad patient', 'GET', '/api/doctor/patients/0/medical-regimens', null, [], () => DOCTOR],
  ['history, none', 'GET', '/api/doctor/patients/OP0070/medical-regimens', null, [BY_ROUTE], () => DOCTOR],
  ['history, grouped per visit', 'GET', '/api/doctor/patients/OP0070/medical-regimens', null, [
    BY_ROUTE,
    HISTORY_REGIMENS,
    [/AS doctorName, cr.name AS roomName FROM TREATMENT t/, TREATMENT_ROWS],
    [/FROM MEDICAL_PRESCRIPTION rx/, RX_ROWS],
    [/FROM TEST tst/, [...LAB_ROWS, { ...LAB_ROWS[0], treatmentId: 502 }]],
    [/FROM SURGERY s/, SURGERY_ROWS],
    [/JOIN TRANSFERENCE tr ON tr.order_id = o.id/, TRANSFER_ROWS],
  ], () => NURSE],
  ['history, legacy prescription schema', 'GET', '/api/doctor/patients/OP0070/medical-regimens', null, [
    BY_ROUTE,
    HISTORY_REGIMENS,
    [/AS doctorName, cr.name AS roomName FROM TREATMENT t/, TREATMENT_ROWS],
    [/COALESCE\(pd.duration, 7\)/, unknownColumn],
    [/FROM MEDICAL_PRESCRIPTION rx/, [{ treatmentId: 503, orderId: 604, prescribedAt: '2026-09-30T10:00:00.000Z', medNo: 1, name: 'A', quantity: 2, usageText: 'u', frequency: 'u', unit: null }]],
  ], () => NURSE],
  ['history, db down', 'GET', '/api/doctor/patients/OP0070/medical-regimens', null, [BY_ROUTE, HISTORY_REGIMENS, [/TRANSFERENCE/, dbError]], () => DOCTOR],

  // ---- transfers
  ['transfer, unknown patient', 'POST', '/api/doctor/patients/OP0070/transfers', TRANSFER, [], () => NURSE],
  ['transfer, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/transfers', TRANSFER, [BY_ROUTE], () => NURSE],
  ['transfer, no reason', 'POST', '/api/doctor/patients/OP0070/transfers', { ...TRANSFER, reason: ' ' }, [BY_ROUTE, ...NEW_TREATMENT], () => NURSE],
  ['transfer, bad kind', 'POST', '/api/doctor/patients/OP0070/transfers', { ...TRANSFER, kind: 'home' }, [BY_ROUTE, ...NEW_TREATMENT], () => NURSE],
  ['transfer, clinic without rooms', 'POST', '/api/doctor/patients/OP0070/transfers', { ...TRANSFER, fromRoomId: 0 }, [BY_ROUTE, ...NEW_TREATMENT], () => NURSE],
  ['transfer, clinic to the same room', 'POST', '/api/doctor/patients/OP0070/transfers', { ...TRANSFER, toRoomId: 1 }, [BY_ROUTE, ...NEW_TREATMENT], () => NURSE],
  ['transfer, clinic: department doctors notified', 'POST', '/api/doctor/patients/OP0070/transfers', TRANSFER, [
    BY_ROUTE, GATE_OPEN, ...NEW_TREATMENT,
    [/^SELECT department_id AS deptId FROM CLINIC_ROOM/, [{ deptId: '3' }]],
    NEW_ORDER,
    [/AS departmentId, dep.name AS departmentName FROM CLINIC_ROOM cr/, [{ roomName: 'R4', departmentId: 3, departmentName: 'Cardiology' }]],
    [/SELECT DISTINCT t.user_id AS userId/, [{ userId: 60 }, { userId: null }, { userId: 61 }]],
    [/AS name FROM PATIENT p JOIN USER u/, [{ name: 'Bao Do' }]],
  ], () => DOCTOR],
  ['transfer, clinic room without department', 'POST', '/api/doctor/patients/OP0070/transfers', { ...TRANSFER, note: null }, [
    BY_ROUTE, ...NEW_TREATMENT, NEW_ORDER,
  ], () => NURSE],
  ['transfer, hospital without a name', 'POST', '/api/doctor/patients/OP0070/transfers', { kind: 'hospital', reason: 'ICU', toHospitalName: ' ' }, [
    BY_ROUTE, ...NEW_TREATMENT, NEW_ORDER,
  ], () => NURSE],
  ['transfer, hospital with form', 'POST', '/api/doctor/patients/OP0070/transfers', {
    kind: 'HOSPITAL', reason: 'ICU', toHospitalId: ' 79001 ', toHospitalName: ' Cho Ray ', transport: 'ambulance', formPayload: { bp: '120/80' },
  }, [BY_ROUTE, ...NEW_TREATMENT, NEW_ORDER], () => NURSE],
  ['transfer, hospital with text form, no optional fields', 'POST', '/api/doctor/patients/OP0070/transfers', {
    kind: 'hospital', reason: 'ICU', toHospitalId: ' ', toHospitalName: 'Cho Ray', transport: '', formPayload: ' raw text ',
  }, [BY_ROUTE, ...NEW_TREATMENT, NEW_ORDER], () => NURSE],
  ['transfer, order insert without id', 'POST', '/api/doctor/patients/OP0070/transfers', TRANSFER, [BY_ROUTE, ...NEW_TREATMENT], () => NURSE],
  ['transfer, db down', 'POST', '/api/doctor/patients/OP0070/transfers', TRANSFER, [BY_ROUTE, ...NEW_TREATMENT, NEW_ORDER, [/^INSERT INTO TRANSFERENCE/, dbError]], () => NURSE],
];

/** The tracking slip payload stamps "now" into its JSON. */
function scrubValue(_key, value) {
  if (typeof value !== 'string' || !value.includes('"createdAt":"')) return undefined;
  return value.replace(/"createdAt":"[^"]*"/g, '"createdAt":"<now>"');
}

characterize('doctor visits (regimen) / slips / documents / transfers: same DB calls, same answers', SNAPSHOT, SCENARIOS, {
  scrubValue,
});
