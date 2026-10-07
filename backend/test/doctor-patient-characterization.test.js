/**
 * Characterization of the doctor-side patient list / record, health info (MEDICAL_RECORD) and
 * diagnosis (TREATMENT) endpoints over the fake DB, including the patient-record cache. Snapshot
 * captured before their SQL moved into repositories (G3 step B, doctor batch 2).
 */
process.env.TZ = 'UTC';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken, fakeInstance } = require('./helpers/fakeDb');
const { patientRecordCacheKey } = require('../dist/services/emr/patientRecordCache');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'doctor-patient-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const DOCTOR = as('DOC', 21);
const NURSE = as('NUR', 41);

// Ages are rendered relative to today: build birth dates that always give the same answer.
const now = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const DOB_30_YEARS = `${now.getUTCFullYear() - 30}-01-15`;
const DOB_10_MONTHS = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 10, 1)));
// Midnight UTC of the day 5 days ago: always between 5 and 6 days old.
const DOB_5_DAYS = ymd(new Date(Date.now() - 5 * 86400000));

/** Patient #7 (USER.id 70) resolves from the route; the gate sees an open regimen. */
const RESOLVE_70 = [/WHERE user_id = :n LIMIT 1$/, [{ id: 7 }]];
const OPEN_VISIT = [/FROM REGIMEN WHERE patient_id = :pid AND `end` IS NULL/, [{ id: 99 }]];

function patientUser(state, fields) {
  return fakeInstance('User', fields, state);
}

const SCENARIOS = [
  // ---- patient list
  ['patients, empty', 'GET', '/api/doctor/patients', null, [], () => DOCTOR],
  ['patients, page with enrichment', 'GET', '/api/doctor/patients?search=an&page=2&limit=500', null, [
    [/AS inDepartment FROM PATIENT pt/, [{ userId: 70, inDepartment: 'Cardiology' }, { userId: 80, inDepartment: null }]],
    [/^SELECT user_id AS userId, patient_id AS patientPk FROM PATIENT/, [{ userId: 70, patientPk: 7 }]],
    [/ROW_NUMBER\(\) OVER \(PARTITION BY r.patient_id/, [{ patientPk: 7, visitTime: '2026-09-01T08:00:00.000Z', icd10: 'J06', interpretation: 'URI', doctorName: 'Dr A' }]],
    [/FROM MEDICAL_RECORD WHERE patient_id IN/, [{ patientPk: 7, weight: 70, height: 175 }]],
  ], (s) => {
    s.models['User.findAndCountAll'] = () => ({
      count: 51,
      rows: [
        patientUser(s, { id: 70, first_name: 'An', last_name: 'Le', sex: 'M', dob: DOB_30_YEARS, ACCOUNT: { username: 'an' } }),
        patientUser(s, { id: 80, first_name: 'Bao', last_name: null, sex: 'F', dob: DOB_10_MONTHS }),
      ],
    });
    return DOCTOR;
  }],
  ['patients, junk paging', 'GET', '/api/doctor/patients?page=-4&limit=abc', null, [], () => NURSE],
  ['patients, db down', 'GET', '/api/doctor/patients', null, [], (s) => {
    s.models['User.findAndCountAll'] = dbError;
    return DOCTOR;
  }],

  // ---- single patient record (cached)
  ['patient, bad id', 'GET', '/api/doctor/patients/OPxyz', null, [], () => DOCTOR],
  ['patient, not found', 'GET', '/api/doctor/patients/OP0070', null, [], () => DOCTOR],
  ['patient, full record (cache miss)', 'GET', '/api/doctor/patients/OP0070', null, [
    [/FROM USER u LEFT JOIN PATIENT p/, [{ id: 70, first_name: 'An', last_name: 'Le', dob: DOB_5_DAYS, sex: 'M', idcard: '0791', tel: '090', patientPk: 7, username: 'an', healthInsuranceId: 'HI1', healthInsuranceExpiredDate: '2027-01-01' }]],
    [/WHERE r.patient_id = :patientPk .*LIMIT 1$/, [{ visitTime: '2026-09-01', department: 'Outpatient', icd10: 'J06', interpretation: 'URI', doctorName: 'Dr A' }]],
    [/FROM MEDICAL_RECORD WHERE patient_id = :patientPk/, [{ weight: 60, height: 0 }]],
    [/t.dept_id AS inDeptId/, [{ inDepartment: 'ER', inDeptId: '3' }]],
    [/cr.department_id AS inDeptId/, [{ inDepartment: 'Lab', inDeptId: 4 }]],
    [/a.status = 'scheduled' AND DATE\(a.time\) = :clinicToday/, [{ id: 11, wallTime: '09:30:00.000', regimenId: 99, roomId: 2, roomName: 'R2' }]],
    [/WHERE id = :regimenId AND patient_id = :patientId/, [{ id: 99 }]],
  ], () => NURSE],
  ['patient, department from appointment, no visit today', 'GET', '/api/doctor/patients/7', null, [
    [/FROM USER u LEFT JOIN PATIENT p/, [{ id: 70, first_name: 'An', dob: null, patientPk: '7' }]],
    [/cr.department_id AS inDeptId/, [{ inDepartment: null, inDeptId: null }]],
    [/a.status = 'scheduled' AND DATE\(a.time\) = :clinicToday/, [{ id: 12, wallTime: '8', regimenId: null, roomId: 0 }]],
  ], () => DOCTOR],
  ['patient, cache hit', 'GET', '/api/doctor/patients/OP0070', null, [
    [/FROM USER u LEFT JOIN PATIENT p/, [{ id: 70, patientPk: 7 }]],
  ], (s) => {
    s.cache.set(patientRecordCacheKey(7), { success: true, patient: { id: 70, cached: true } });
    return DOCTOR;
  }],
  ['patient, user without PATIENT row', 'GET', '/api/doctor/patients/90', null, [
    [/FROM USER u LEFT JOIN PATIENT p/, [{ id: 90, first_name: 'Staff', patientPk: null }]],
  ], () => DOCTOR],
  ['patient, db down', 'GET', '/api/doctor/patients/7', null, [[/./, dbError]], () => DOCTOR],

  // ---- health info (not gated by the active-visit check)
  ['health info, bad id', 'GET', '/api/doctor/patients/abc/health-info', null, [], () => DOCTOR],
  ['health info, unknown patient', 'GET', '/api/doctor/patients/OP0070/health-info', null, [], () => DOCTOR],
  ['health info, latest + patient JSON columns', 'GET', '/api/doctor/patients/OP0070/health-info', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, patient_id: 7, height: 170, status: 'draft' }, s);
    s.models['Patient.findByPk'] = () => ({ blood_type: 'O+', allergic_info: '{"drugAllergies":["penicillin"]}', medical_history: 'not json' });
    return DOCTOR;
  }],
  ['health info, none recorded', 'GET', '/api/doctor/patients/OP0070/health-info', null, [RESOLVE_70], (s) => {
    s.models['Patient.findByPk'] = () => ({ blood_type: null, allergic_info: { foodAllergies: [] }, medical_history: null });
    return DOCTOR;
  }],
  ['health info, db down', 'GET', '/api/doctor/patients/OP0070/health-info', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = dbError;
    return DOCTOR;
  }],
  ['health history, defaults', 'GET', '/api/doctor/patients/OP0070/health-info/history', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findAndCountAll'] = () => ({ count: 11, rows: [{ id: 1 }, { id: 2 }] });
    return NURSE;
  }],
  ['health history, page 2 of 5', 'GET', '/api/doctor/patients/OP0070/health-info/history?page=2&limit=5', null, [RESOLVE_70], () => NURSE],
  ['create health info, unknown patient', 'POST', '/api/doctor/patients/OP0070/health-info', { height: 170, weight: 60 }, [RESOLVE_70], () => DOCTOR],
  ['create health info, bad height', 'POST', '/api/doctor/patients/OP0070/health-info', { height: 0, weight: 60 }, [RESOLVE_70], (s) => {
    s.models['Patient.findByPk'] = () => ({ patient_id: 7 });
    return DOCTOR;
  }],
  ['create health info, bad time', 'POST', '/api/doctor/patients/OP0070/health-info', { height: 170, weight: 60, time: 'nope' }, [RESOLVE_70], (s) => {
    s.models['Patient.findByPk'] = () => ({ patient_id: 7 });
    return DOCTOR;
  }],
  ['create health info', 'POST', '/api/doctor/patients/OP0070/health-info', {
    time: '2026-10-01T08:00:00.000Z',
    currentSymptoms: ' cough ',
    height: '170',
    weight: 60.5,
    bloodPressureSys: 120,
    bloodPressureDia: 80,
    heartRate: '72.9',
    respiratoryRate: '',
    temperature: '37.2',
    spo2: 'x',
    status: 'SIGNED',
  }, [RESOLVE_70], (s) => {
    s.models['Patient.findByPk'] = () => ({ patient_id: 7 });
    return NURSE;
  }],
  ['create health info, defaults', 'POST', '/api/doctor/patients/OP0070/health-info', {
    height: 1,
    weight: 1,
    blood_pressure: '110/70',
  }, [RESOLVE_70], (s) => {
    s.models['Patient.findByPk'] = () => ({ patient_id: 7 });
    return DOCTOR;
  }],
  ['update health info, not found', 'PUT', '/api/doctor/patients/OP0070/health-info/3', { height: 171 }, [RESOLVE_70], () => DOCTOR],
  ['update health info, confirmed record', 'PUT', '/api/doctor/patients/OP0070/health-info/3', { height: 171 }, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, status: 'confirmed' }, s);
    return DOCTOR;
  }],
  ['update health info', 'PUT', '/api/doctor/patients/OP0070/health-info/3', {
    symptoms: ' fever ', time: '2026-10-02T00:00:00.000Z', height: -1, weight: '61', bloodPressureSys: 1, bloodPressureDia: 2,
    heartRate: 'x', respiratoryRate: 18, temperature: 38, spo2: 97, status: 'confirmed',
  }, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, status: 'draft', height: 170 }, s);
    return DOCTOR;
  }],
  ['update health info, nothing to change', 'PUT', '/api/doctor/patients/OP0070/health-info/3', { time: 'bad' }, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, status: null }, s);
    return DOCTOR;
  }],
  ['delete health info', 'DELETE', '/api/doctor/patients/OP0070/health-info/3', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3 }, s);
    return DOCTOR;
  }],
  ['delete health info, not found', 'DELETE', '/api/doctor/patients/OP0070/health-info/3', null, [RESOLVE_70], () => DOCTOR],
  ['confirm health info', 'PATCH', '/api/doctor/patients/OP0070/health-info/3/confirm', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, status: 'draft' }, s);
    return NURSE;
  }],
  ['confirm health info, already confirmed', 'PATCH', '/api/doctor/patients/OP0070/health-info/3/confirm', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = () => fakeInstance('MedicalRecord', { id: 3, status: 'signed' }, s);
    return NURSE;
  }],
  ['confirm health info, db down', 'PATCH', '/api/doctor/patients/OP0070/health-info/3/confirm', null, [RESOLVE_70], (s) => {
    s.models['MedicalRecord.findOne'] = dbError;
    return NURSE;
  }],

  // ---- diagnoses
  ['diagnoses, unknown patient', 'GET', '/api/doctor/patients/OP0070/diagnoses', null, [], () => DOCTOR],
  ['diagnoses', 'GET', '/api/doctor/patients/OP0070/diagnoses', null, [
    RESOLVE_70,
    [/AS doctorName, COALESCE\(NULLIF\(TRIM\(dep_dx.name\)/, [{ id: 5, patientId: 7, icd10: 'J06' }]],
  ], () => DOCTOR],
  ['diagnoses, db down', 'GET', '/api/doctor/patients/OP0070/diagnoses', null, [RESOLVE_70, [/FROM TREATMENT t/, dbError]], () => DOCTOR],
  ['create diagnosis, gate: no active visit', 'POST', '/api/doctor/patients/OP0070/diagnoses', { complaint: 'c', icd10: 'J06' }, [RESOLVE_70], () => DOCTOR],
  ['create diagnosis, missing fields', 'POST', '/api/doctor/patients/OP0070/diagnoses', { complaint: 'c' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['create diagnosis, no doctor resolvable', 'POST', '/api/doctor/patients/OP0070/diagnoses', { complaint: 'c', icd10: 'J06' }, [RESOLVE_70], () => NURSE],
  ['create diagnosis, new disease + regimen, department by name', 'POST', '/api/doctor/patients/OP0070/diagnoses', {
    complaint: 'Sore throat', icd10: 'J02', interpretation: 'Pharyngitis', note: 'n', department: 'ENT',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]],
    [/^INSERT INTO DISEASE/, [301, 1]],
    [/^INSERT INTO REGIMEN/, [401, 1]],
    [/^SELECT id FROM DEPARTMENT WHERE TRIM\(name\)/, [{ id: 6 }]],
    [/^INSERT INTO TREATMENT/, [501, 1]],
    [/^SELECT first_name, last_name FROM USER/, [{ first_name: 'Hoa', last_name: 'Tran' }]],
  ], () => DOCTOR],
  ['create diagnosis, known disease, dept from appointment, legacy TREATMENT', 'POST', '/api/doctor/patients/OP0070/diagnoses', {
    complaint: 'Cough', icd10: 'J06', department: 'Outpatient',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT t.doctor_id FROM TREATMENT t/, [{ doctor_id: 6 }]],
    [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 300 }]],
    [/WHERE patient_id = :patientId AND disease_id = :diseaseId/, [{ id: 400 }]],
    [/FROM APPOINTMENT a JOIN CLINIC_ROOM cr/, [{ deptId: 2 }]],
    [/^INSERT INTO TREATMENT \(time, `condition`, type, regimen_id, doctor_id, room_id, dept_id\)/, () => Object.assign(new Error('Unknown column dept_id'), { original: { code: 'ER_BAD_FIELD_ERROR' } })],
    [/^INSERT INTO TREATMENT/, [502, 1]],
  ], () => NURSE],
  ['create diagnosis, dept from doctor mapping, numeric department label', 'POST', '/api/doctor/patients/OP0070/diagnoses', {
    complaint: 'x', icd10: 'Z00', department: '9',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]],
    [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 300 }]],
    [/WHERE patient_id = :patientId AND disease_id = :diseaseId/, [{ id: 400 }]],
    [/FROM DOCTOR_DEPARTMENT dd/, [{ deptId: 8 }]],
    [/^INSERT INTO TREATMENT/, [503, 1]],
  ], () => DOCTOR],
  ['create diagnosis, db down', 'POST', '/api/doctor/patients/OP0070/diagnoses', { complaint: 'c', icd10: 'J06' }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]],
    [/DISEASE/, dbError],
  ], () => DOCTOR],
  ['update diagnosis, bad id', 'PUT', '/api/doctor/patients/OP0070/diagnoses/x', { complaint: 'c', icd10: 'J06' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update diagnosis, missing fields', 'PUT', '/api/doctor/patients/OP0070/diagnoses/5', { icd10: 'J06' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update diagnosis, not found', 'PUT', '/api/doctor/patients/OP0070/diagnoses/5', { complaint: 'c', icd10: 'J06' }, [RESOLVE_70, OPEN_VISIT], () => DOCTOR],
  ['update diagnosis, same disease', 'PUT', '/api/doctor/patients/OP0070/diagnoses/5', {
    complaint: ' Cough ', icd10: ' J06 ', department: 'Lab',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT t.id, t.regimen_id/, [{ id: 5, regimen_id: 400, patient_id: 7, regimen_disease_id: '300' }]],
    [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 300 }]],
  ], () => DOCTOR],
  ['update diagnosis, new disease moves regimen + description', 'PUT', '/api/doctor/patients/OP0070/diagnoses/5', {
    complaint: 'Flu', icd10: 'J11', interpretation: ' Influenza ', note: 'x',
  }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT t.id, t.regimen_id/, [{ id: 5, regimen_id: 400, patient_id: 7, regimen_disease_id: null }]],
    [/^SELECT id FROM DISEASE WHERE icd_code/, [{ id: 310 }]],
    [/WHERE patient_id = :patientId AND disease_id = :diseaseId/, []],
    [/^INSERT INTO REGIMEN/, [410, 1]],
  ], () => NURSE],
  ['update diagnosis, db down', 'PUT', '/api/doctor/patients/OP0070/diagnoses/5', { complaint: 'c', icd10: 'J06' }, [
    RESOLVE_70,
    OPEN_VISIT,
    [/^SELECT t.id, t.regimen_id/, dbError],
  ], () => DOCTOR],
];

/** Timestamps the handlers stamp with "now". */
function scrubValue(key, value) {
  if ((key === 'createdAt' || key === 'time') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return Math.abs(Date.parse(value) - Date.now()) < 5 * 60_000 ? '<now>' : undefined;
  }
  return undefined;
}

characterize('doctor patients / health info / diagnoses: same DB calls, same answers', SNAPSHOT, SCENARIOS, {
  scrubValue,
});

test('diagnosis writes invalidate the same cache key the patient record is cached under', () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const keyOf = (scenario, event) => snapshot[scenario].db.find((c) => c.event === event)?.key;
  const cachedUnder = keyOf('patient, full record (cache miss)', 'cache.set');
  assert.ok(cachedUnder);
  assert.equal(keyOf('create diagnosis, new disease + regimen, department by name', 'cache.del'), cachedUnder);
  assert.equal(keyOf('update diagnosis, same disease', 'cache.del'), cachedUnder);
});
