/**
 * Characterization of the doctor-side order endpoints over the fake DB: prescriptions (with the
 * BYT e-prescription meta and the legacy no-duration schema), lab tests (+ attachment upload) and
 * surgeries. Snapshot captured before their SQL moved into repositories (G3 step B, doctor batch 3).
 */
process.env.TZ = 'UTC';

const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'doctor-orders-sql.snapshot.json');

// Lab uploads are written under <cwd>/uploads/lab: keep them out of the working tree.
const UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'techcare-orders-'));
process.chdir(UPLOAD_ROOT);
test.after(() => fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true }));

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const DOCTOR = as('DOC', 21);
const NURSE = as('NUR', 41);
const TECH = as('TEC', 61);

// Children under 72 months need weight + contact phone: build birth dates relative to today.
const now = new Date();
const DOB_ADULT = `${now.getUTCFullYear() - 30}-01-15`;
const DOB_CHILD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 10, 1)).toISOString().slice(0, 10);

/** Patient #7 (USER.id 70) resolves from the route; the gate sees an open regimen. */
const RESOLVE_70 = [/WHERE user_id = :n LIMIT 1$/, [{ id: 7 }]];
const OPEN_VISIT = [/FROM REGIMEN WHERE patient_id = :pid AND `end` IS NULL/, [{ id: 99 }]];
/** createTreatmentForPatient: own DOCTOR row, Z00.0 exists, the open visit, a new TREATMENT. */
const NEW_TREATMENT = [
  [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]],
  [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 300 }]],
  [/^SELECT id FROM REGIMEN WHERE patient_id = :patientId AND `end` IS NULL ORDER BY id DESC/, [{ id: 99 }]],
  [/^INSERT INTO TREATMENT/, [501, 1]],
];
const NEW_ORDER = [/^INSERT INTO `ORDER`/, [601, 1]];
const unknownColumn = () =>
  Object.assign(new Error('Unknown column duration'), { original: { code: 'ER_BAD_FIELD_ERROR' } });

const EXISTING_META = JSON.stringify({
  v: 2,
  department: 'Cardiology',
  byt: {
    code: 'TC001fixed01-C',
    prescriptionType: 'H',
    facilityName: 'Old clinic',
    contactPhone: '0901',
    patientIdCard: '079',
    patientPhone: '0909',
    patientWeightKg: '61',
  },
});

const MEDS = [
  { name: ' Paracetamol 500mg ', quantity: '10', duration: '5', usage: 'After meals', unit: 'Viên', note: ' ' },
  { name: 'Brand new syrup', quantity: 'x', duration: 0, usage: 'u'.repeat(120), unit: 'Siro', note: 'n'.repeat(160) },
  { name: '   ', quantity: 1 },
  { name: 'Eye drops', unit: 'nhỏ mắt', note: 'left eye' },
];
const MED_RULES = [
  [/^SELECT id FROM MEDICINE WHERE name = :name/, (call) => (call.replacements.name.startsWith('Paracetamol') ? [{ id: '31' }] : [])],
  [/^INSERT INTO MEDICINE/, (call) => [call.replacements.name === 'Eye drops' ? 33 : 32, 1]],
];

const RX_ROWS = [
  {
    order_id: 601, time: '2026-09-02T08:00:00.000Z', prescriptionNote: EXISTING_META, prescriptionDuration: '10',
    doctorUserId: 21, doctorName: 'Hoa Tran', medNo: 1, name: 'Paracetamol', quantity: 10, lineDuration: 5,
    usage: 'After meals', unit: 'tablet', medNote: null,
  },
  {
    order_id: 601, time: '2026-09-02T08:00:00.000Z', prescriptionNote: EXISTING_META, prescriptionDuration: '10',
    doctorUserId: 21, doctorName: 'Hoa Tran', medNo: 2, name: 'Syrup', quantity: null, lineDuration: null,
    usage: null, unit: null, medNote: 'n',
  },
  {
    order_id: 600, time: '2026-08-01T08:00:00.000Z', prescriptionNote: 'Khoa Nhi', prescriptionDuration: null,
    doctorUserId: null, doctorName: null, medNo: null, name: null,
  },
];

const SCENARIOS = [
  // ---- prescriptions: list
  ['prescriptions, bad id', 'GET', '/api/doctor/patients/OPxyz/prescriptions', null, [], () => DOCTOR],
  ['prescriptions, grouped with BYT meta + legacy note', 'GET', '/api/doctor/patients/OP0070/prescriptions', null, [
    RESOLVE_70,
    [/COALESCE\(rx.duration, 7\)/, RX_ROWS],
  ], () => DOCTOR],
  ['prescriptions, legacy schema without duration', 'GET', '/api/doctor/patients/OP0070/prescriptions', null, [
    RESOLVE_70,
    [/COALESCE\(rx.duration, 7\)/, unknownColumn],
    [/FROM MEDICAL_PRESCRIPTION rx/, [{ order_id: 5, time: '2026-07-01T00:00:00.000Z', prescriptionNote: '', doctorUserId: 21, name: 'A', quantity: 2, medNo: 1 }]],
  ], () => NURSE],
  ['prescriptions, db down', 'GET', '/api/doctor/patients/OP0070/prescriptions', null, [RESOLVE_70, [/MEDICAL_PRESCRIPTION/, dbError]], () => DOCTOR],

  // ---- prescriptions: create
  ['create prescription, gate: no active visit', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [RESOLVE_70], () => DOCTOR],
  ['create prescription, bad id', 'POST', '/api/doctor/patients/OPxyz/prescriptions', { medications: MEDS }, [], () => DOCTOR],
  ['create prescription, no medications', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: [] }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_ADULT, idcard: '079', tel: '0909' }]],
  ], () => DOCTOR],
  ['create prescription, child without weight', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_CHILD, idcard: null, tel: '0909' }]],
  ], () => DOCTOR],
  ['create prescription, child without contact phone', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_CHILD, idcard: null, tel: null }]],
    [/^SELECT weight FROM MEDICAL_RECORD/, [{ weight: 9.5 }]],
  ], () => DOCTOR],
  ['create prescription, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [
    RESOLVE_70,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_ADULT }]],
  ], () => NURSE],
  ['create prescription, adult', 'POST', '/api/doctor/patients/OP0070/prescriptions', {
    department: 'Cardiology',
    duration: '10.7',
    medications: MEDS,
    byt: { facilityName: '  ', advice: ' Rest ', insuranceId: 'HI1', patientAddress: 'Q1', facilityPhone: '028' },
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_ADULT, idcard: ' 079 ', tel: '0909' }]],
    [/^SELECT weight FROM MEDICAL_RECORD/, [{ weight: 0 }]],
    [/^SELECT id FROM DEPARTMENT WHERE TRIM\(name\)/, [{ id: 6 }]],
    ...NEW_TREATMENT,
    NEW_ORDER,
    ...MED_RULES,
    [/^SELECT first_name, last_name FROM USER/, [{ first_name: 'Hoa', last_name: 'Tran' }]],
    [/^SELECT time FROM MEDICAL_PRESCRIPTION/, [{ time: '2026-10-01T09:00:00.000Z' }]],
  ], () => DOCTOR],
  ['create prescription, child with guardian, code collision, legacy schema', 'POST', '/api/doctor/patients/OP0070/prescriptions', {
    medications: [{ name: 'Paracetamol', quantity: 2 }],
    duration: -3,
    byt: 'not an object',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: DOB_CHILD, idcard: '', tel: '' }]],
    [/WHERE note LIKE :needle/, (() => {
      let n = 0;
      return () => (++n === 1 ? [{ order_id: 1 }] : []);
    })()],
    [/^SELECT name, tel FROM RELATIVE/, [{ name: ' Mother ', tel: '0912' }]],
    [/^SELECT weight FROM MEDICAL_RECORD/, [{ weight: '9.5' }]],
    ...NEW_TREATMENT,
    NEW_ORDER,
    [/^INSERT INTO MEDICAL_PRESCRIPTION \(order_id, duration/, unknownColumn],
    [/^INSERT INTO PRESCRIPTION_DETAIL \(prescription_id, no, medicine_id, quantity, duration/, unknownColumn],
    ...MED_RULES,
  ], () => NURSE],
  ['create prescription, only blank names', 'POST', '/api/doctor/patients/OP0070/prescriptions', {
    medications: [{ name: ' ' }, {}],
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, [{ dob: null }]],
    ...NEW_TREATMENT,
    NEW_ORDER,
  ], () => DOCTOR],
  ['create prescription, order insert without id', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [
    RESOLVE_70,
    OPEN_VISIT,
    ...NEW_TREATMENT,
  ], () => DOCTOR],
  ['create prescription, medicine insert without id', 'POST', '/api/doctor/patients/OP0070/prescriptions', {
    medications: [{ name: 'Brand new syrup' }],
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    ...NEW_TREATMENT,
    NEW_ORDER,
  ], () => DOCTOR],
  ['create prescription, db down', 'POST', '/api/doctor/patients/OP0070/prescriptions', { medications: MEDS }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/FROM PATIENT p JOIN USER u/, dbError],
  ], () => DOCTOR],

  // ---- prescriptions: update
  ['update prescription, bad id', 'PUT', '/api/doctor/patients/OP0070/prescriptions/abc', { medications: MEDS }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update prescription, no medications', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', { medications: 'x' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update prescription, not found', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', { medications: MEDS }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update prescription, keeps code and department, body overrides', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', {
    medications: MEDS,
    duration: 14,
    byt: { code: 'bad', prescriptionType: 'n', advice: 'Drink water', facilityPhone: ' ' },
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT rx.order_id FROM MEDICAL_PRESCRIPTION rx/, [{ order_id: 601 }]],
    [/^SELECT note FROM MEDICAL_PRESCRIPTION/, [{ note: EXISTING_META }]],
    ...MED_RULES,
    [/^SELECT first_name, last_name FROM USER/, []],
    [/^SELECT time, duration FROM MEDICAL_PRESCRIPTION/, [{ time: '2026-10-01T09:00:00.000Z', duration: 14 }]],
  ], () => DOCTOR],
  ['update prescription, legacy note gets body code, legacy schema', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', {
    department: null,
    medications: [{ name: 'Paracetamol', unit: 'capsules' }],
    byt: { code: 'TC001fixed02-H' },
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT rx.order_id FROM MEDICAL_PRESCRIPTION rx/, [{ order_id: 601 }]],
    [/^SELECT note FROM MEDICAL_PRESCRIPTION/, [{ note: 'Khoa Nhi' }]],
    [/^SELECT time, duration FROM MEDICAL_PRESCRIPTION/, unknownColumn],
    [/^SELECT time FROM MEDICAL_PRESCRIPTION/, [{ time: '2026-10-01T09:00:00.000Z' }]],
    [/^INSERT INTO PRESCRIPTION_DETAIL \(prescription_id, no, medicine_id, quantity, duration/, unknownColumn],
    ...MED_RULES,
  ], () => NURSE],
  ['update prescription, duration column missing on update, new code', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', {
    medications: [{ name: 'Paracetamol' }],
    duration: 3,
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT rx.order_id FROM MEDICAL_PRESCRIPTION rx/, [{ order_id: 601 }]],
    [/^UPDATE MEDICAL_PRESCRIPTION SET time = NOW\(\), note = :note, duration = :duration/, unknownColumn],
    ...MED_RULES,
  ], () => DOCTOR],
  ['update prescription, only blank names', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', { medications: [{ name: '' }] }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT rx.order_id FROM MEDICAL_PRESCRIPTION rx/, [{ order_id: 601 }]],
    [/^SELECT note FROM MEDICAL_PRESCRIPTION/, [{ note: EXISTING_META }]],
  ], () => DOCTOR],
  ['update prescription, db down', 'PUT', '/api/doctor/patients/OP0070/prescriptions/601', { medications: MEDS }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT rx.order_id/, dbError],
  ], () => DOCTOR],

  // ---- lab tests
  ['lab tests, bad id', 'GET', '/api/doctor/patients/OPxyz/lab-tests', null, [], () => TECH],
  ['lab tests', 'GET', '/api/doctor/patients/OP0070/lab-tests', null, [
    RESOLVE_70,
    [/FROM TEST tst/, [{ id: 701, patientId: 7, testType: 'CBC', resultSummary: 'ok' }]],
  ], () => TECH],
  ['lab tests, db down', 'GET', '/api/doctor/patients/OP0070/lab-tests', null, [RESOLVE_70, [/FROM TEST tst/, dbError]], () => DOCTOR],
  ['create lab test, bad id', 'POST', '/api/doctor/patients/OPxyz/lab-tests', { testType: 'CBC', testDate: '2026-10-01' }, [], () => DOCTOR],
  ['create lab test, missing fields', 'POST', '/api/doctor/patients/OP0070/lab-tests', { testType: 'CBC' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['create lab test, bad date', 'POST', '/api/doctor/patients/OP0070/lab-tests', { testType: 'CBC', testDate: 'soon' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['create lab test, doctor, explicit technician, offset date', 'POST', '/api/doctor/patients/OP0070/lab-tests', {
    testType: 'CBC', testDate: '2026-10-01T09:30:00+07:00', technicianId: '8', technicianName: 'Lan', resultSummary: 'WBC high', fileUrl: '/uploads/lab/a.pdf', note: 'fasting',
  }, [RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT, NEW_ORDER], () => DOCTOR],
  ['create lab test, technician resolves own id, local date', 'POST', '/api/doctor/patients/OP0070/lab-tests', {
    testType: 'X-ray', testDate: '2026-10-01 14:05', technicianId: 'abc',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT technician_id FROM TECHNICIAN/, [{ technician_id: 9 }]],
    [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, []],
    [/^SELECT doctor_id AS doctorId FROM APPOINTMENT WHERE patient_id = :patientPk AND status = 'scheduled'/, [{ doctorId: '5' }]],
    ...NEW_TREATMENT.slice(1),
    NEW_ORDER,
  ], () => TECH],
  ['create lab test, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/lab-tests', { testType: 'CBC', testDate: '2026-10-01T08:00:00.123' }, [RESOLVE_70], () => NURSE],
  ['create lab test, order insert without id', 'POST', '/api/doctor/patients/OP0070/lab-tests', { testType: 'CBC', testDate: '2026-10-01' }, [
    RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT,
  ], () => DOCTOR],
  ['create lab test, db down', 'POST', '/api/doctor/patients/OP0070/lab-tests', { testType: 'CBC', testDate: '2026-10-01' }, [
    RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT, NEW_ORDER, [/^INSERT INTO TEST /, dbError],
  ], () => DOCTOR],
  ['update lab test, bad id', 'PUT', '/api/doctor/patients/OPxyz/lab-tests/701', { note: 'x' }, [], () => DOCTOR],
  ['update lab test, not found', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', { note: 'x' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update lab test, bad date', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', { testDate: '' }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]],
  ], () => DOCTOR],
  ['update lab test, every field, technician cleared', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', {
    testType: 'CBC', testDate: '2026-10-02T10:00:00Z', technicianId: null, technicianName: 'n/a', resultSummary: '', fileUrl: null, note: 'redo',
  }, [RESOLVE_70, OPEN_VISIT, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]]], () => DOCTOR],
  ['update lab test, technician with nothing else', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', {}, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]], [/^SELECT technician_id FROM TECHNICIAN/, [{ technician_id: 9 }]],
  ], () => TECH],
  ['update lab test, type only, explicit technician id', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', { testType: 'Urine', technicianId: '12' }, [
    RESOLVE_70, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]],
  ], () => NURSE],
  ['update lab test, db down', 'PUT', '/api/doctor/patients/OP0070/lab-tests/701', { note: 'x' }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]], [/^UPDATE TEST/, dbError],
  ], () => DOCTOR],
  ['lab test details, bad patient', 'GET', '/api/doctor/patients/OPxyz/lab-tests/701/details', null, [], () => DOCTOR],
  ['lab test details, bad test id', 'GET', '/api/doctor/patients/OP0070/lab-tests/0/details', null, [RESOLVE_70], () => DOCTOR],
  ['lab test details, not found', 'GET', '/api/doctor/patients/OP0070/lab-tests/701/details', null, [RESOLVE_70], () => DOCTOR],
  ['lab test details', 'GET', '/api/doctor/patients/OP0070/lab-tests/701/details', null, [
    RESOLVE_70,
    [/^SELECT tst.id FROM TEST tst/, [{ id: 701 }]],
    [/FROM TEST_DETAIL/, [{ testId: 701, no: 1, itemIndex: 'summary', result: 'ok', unit: null }]],
  ], () => TECH],
  ['lab test details, db down', 'GET', '/api/doctor/patients/OP0070/lab-tests/701/details', null, [RESOLVE_70, [/FROM TEST tst/, dbError]], () => DOCTOR],
  ['lab attachment, missing fields', 'POST', '/api/doctor/lab-attachments', { fileName: 'a.pdf' }, [], () => TECH],
  ['lab attachment, unsupported type', 'POST', '/api/doctor/lab-attachments', { fileName: 'a.exe', mimeType: 'application/x-msdownload', dataBase64: 'AAAA' }, [], () => TECH],
  ['lab attachment, empty content', 'POST', '/api/doctor/lab-attachments', { fileName: 'a.pdf', mimeType: 'application/pdf', dataBase64: '====' }, [], () => TECH],
  ['lab attachment, saved', 'POST', '/api/doctor/lab-attachments', { fileName: '../kết quả (1).PNG', mimeType: 'IMAGE/PNG', dataBase64: 'iVBORw0KGgo=' }, [], () => DOCTOR],
  ['lab attachment, no extension', 'POST', '/api/doctor/lab-attachments', { fileName: '???', mimeType: 'application/pdf', dataBase64: 'JVBERi0=' }, [], () => DOCTOR],

  // ---- surgeries
  ['surgeries, bad id', 'GET', '/api/doctor/patients/OPxyz/surgeries', null, [], () => DOCTOR],
  ['surgeries', 'GET', '/api/doctor/patients/OP0070/surgeries', null, [
    RESOLVE_70,
    [/FROM SURGERY s/, [{ id: 801, patientId: 7, type: 'Day Surgery', surgeonName: 'Le An' }]],
  ], () => DOCTOR],
  ['surgeries, db down', 'GET', '/api/doctor/patients/OP0070/surgeries', null, [RESOLVE_70, [/FROM SURGERY s/, dbError]], () => DOCTOR],
  ['create surgery, bad id', 'POST', '/api/doctor/patients/OPxyz/surgeries', {}, [], () => DOCTOR],
  ['create surgery, bad type', 'POST', '/api/doctor/patients/OP0070/surgeries', { type: 'Brain' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['create surgery, end before start', 'POST', '/api/doctor/patients/OP0070/surgeries', {
    type: 'Minor Surgery', start: '2026-10-01T10:00:00Z', end: '2026-10-01T09:00:00Z',
  }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['create surgery, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/surgeries', { start: '2026-10-01T10:00:00Z' }, [RESOLVE_70], () => NURSE],
  ['create surgery, named surgeon by doctor id', 'POST', '/api/doctor/patients/OP0070/surgeries', {
    type: 'Major Ambulatory Surgery', start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:29:40Z', doctorId: '12',
    surgeonName: 'typed name', urgency: 'high', result: ' ok ', note: ' n ',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    ...NEW_TREATMENT,
    NEW_ORDER,
    [/AS surgeonName FROM DOCTOR d/, [{ surgeonName: 'Le An' }]],
  ], () => DOCTOR],
  ['create surgery, defaults', 'POST', '/api/doctor/patients/OP0070/surgeries', {
    start: '2026-10-01T10:00:00Z', surgeonName: '  ', urgency: 'whenever', doctorId: 0,
  }, [RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT, NEW_ORDER], () => DOCTOR],
  ['create surgery, unknown surgeon', 'POST', '/api/doctor/patients/OP0070/surgeries', { start: '2026-10-01T10:00:00Z', doctorId: 99 }, [
    RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT, NEW_ORDER,
  ], () => DOCTOR],
  ['create surgery, order insert without id', 'POST', '/api/doctor/patients/OP0070/surgeries', { start: '2026-10-01T10:00:00Z' }, [
    RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT,
  ], () => DOCTOR],
  ['create surgery, db down', 'POST', '/api/doctor/patients/OP0070/surgeries', { start: '2026-10-01T10:00:00Z' }, [
    RESOLVE_70, OPEN_VISIT, ...NEW_TREATMENT, NEW_ORDER, [/^INSERT INTO SURGERY/, dbError],
  ], () => DOCTOR],
  ['update surgery, bad id', 'PUT', '/api/doctor/patients/OPxyz/surgeries/801', {}, [], () => DOCTOR],
  ['update surgery, not found', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', {}, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update surgery, row vanished', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', {}, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
  ], () => DOCTOR],
  ['update surgery, bad type', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', { type: 'Brain' }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
    [/^SELECT start, end, type/, [{ start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z', type: 'Day Surgery' }]],
  ], () => DOCTOR],
  ['update surgery, bad dates', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', { end: 'never' }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
    [/^SELECT start, end, type/, [{ start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z', type: 'Day Surgery' }]],
  ], () => DOCTOR],
  ['update surgery, keeps current, legacy type', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', {}, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
    [/^SELECT start, end, type/, [{ start: '2026-10-01T10:00:00Z', end: '2026-10-01T10:00:20Z', type: 'Appendectomy', urgency: 'LOW', surgeon: '12', result: 'r' }]],
    [/^SELECT note FROM PROCEDURE_/, [{ note: 'kept' }]],
  ], () => DOCTOR],
  ['update surgery, every field, surgeon by doctor id', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', {
    type: '', start: '2026-10-02T08:00:00Z', end: '2026-10-02T09:00:00Z', doctorId: 12, surgeonName: 'typed', urgency: 'x', result: null, note: 'new',
  }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
    [/^SELECT start, end, type/, [{ start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z', type: 'Minor Surgery', urgency: 'LOW', surgeon: null }]],
    [/AS surgeonName FROM DOCTOR d/, [{ surgeonName: '' }]],
  ], () => NURSE],
  ['update surgery, unknown surgeon', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', { doctorId: 99, surgeonName: ' ' }, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, [{ id: 801 }]],
    [/^SELECT start, end, type/, [{ start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z', type: 'Minor Surgery' }]],
  ], () => DOCTOR],
  ['update surgery, db down', 'PUT', '/api/doctor/patients/OP0070/surgeries/801', {}, [
    RESOLVE_70, OPEN_VISIT, [/^SELECT s.id FROM SURGERY s/, dbError],
  ], () => DOCTOR],
];

/** Generated BYT codes (fixtures use `TC001fixed..`), upload file names and "now" timestamps. */
const GENERATED_BYT_CODE = /TC001(?!fixed)[a-z0-9]{7}-[NHC]/g;
const UPLOAD_NAME = /lab_\d+_[a-z0-9]+/g;
function scrubValue(key, value) {
  if (typeof value !== 'string') return undefined;
  if ((key === 'createdAt' || key === 'start' || key === 'end') && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    if (Math.abs(Date.parse(value) - Date.now()) < 3 * 3600_000) return '<now>';
  }
  const scrubbed = value.replace(GENERATED_BYT_CODE, '<byt-code>').replace(UPLOAD_NAME, 'lab_<generated>');
  return scrubbed !== value ? scrubbed : undefined;
}

characterize('doctor prescriptions / lab tests / surgeries: same DB calls, same answers', SNAPSHOT, SCENARIOS, {
  scrubValue,
});
