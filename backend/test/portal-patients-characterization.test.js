/**
 * GET /api/appointments/patients (nurse / technician patient list): every patient with age, latest
 * standalone diagnosis, department and today's appointment. Snapshot captured before the per-patient
 * lookups were batched. Rules answer both the per-patient and the batched query shapes.
 */
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'portal-patients-sql.snapshot.json');
const NURSE = { headers: { Authorization: `Bearer ${accessToken({ userId: 41, role: 'NUR', username: 'nur41' })}` } };

// Ages are relative to today: a fixed birthday 30 years back always gives the same age.
const DOB_30 = `${new Date().getUTCFullYear() - 30}-01-15`;

const BASE = [/FROM PATIENT pt LEFT JOIN USER u ON u.id = pt.user_id/, [
  { id: 70, patientPk: 7, username: 'bao', firstName: 'Bao', lastName: 'Do', gender: 'M', dob: DOB_30, inDepartment: 'Cardiology' },
  { id: '80', patientPk: 8, username: 'an', firstName: null, lastName: null, gender: null, dob: null, inDepartment: null },
  { id: null, patientPk: 9, username: null, firstName: 'No', lastName: 'User', dob: null },
]];
const PK_BY_USER = { 70: 7, 80: 8 };
const RESOLVE = [/^SELECT patient_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1$/, (call) => (PK_BY_USER[call.replacements.n] ? [{ id: PK_BY_USER[call.replacements.n] }] : [])];
const TODAY = [/WHERE DATE\(a.time\) = :clinicToday AND a.status = 'scheduled'/, [
  { patientId: 70, mapPatientPk: 7, appointmentId: 11, timeHm: '09:30:00', regimenId: 99, checkedIn: 1, roomId: '2', roomName: 'R2', appointmentDoctorName: ' Hoa Tran ' },
  { patientId: 7, mapPatientPk: 7, appointmentId: 12, timeHm: '10:00', checkedIn: 0 },
]];
const DIAGNOSES = { 7: { icd10: 'J06', interpretation: 'URI', visitTime: '2026-09-01T08:00:00.000Z', doctorName: 'Le An' } };
/** Latest diagnosis: one patient (`:patientPk`) or several (`:patientPks`, rows tagged with patientPk). */
const DIAGNOSIS = [/dis.description AS interpretation, t.time AS visitTime/, (call) => {
  const r = call.replacements;
  if (r.patientPks) return r.patientPks.filter((pk) => DIAGNOSES[pk]).map((pk) => ({ patientPk: pk, ...DIAGNOSES[pk] }));
  return DIAGNOSES[r.patientPk] ? [DIAGNOSES[r.patientPk]] : [];
}];

const SCENARIOS = [
  ['portal patients, none', 'GET', '/api/appointments/patients', null, [], () => NURSE],
  ['portal patients', 'GET', '/api/appointments/patients', null, [BASE, RESOLVE, TODAY, DIAGNOSIS], () => NURSE],
  ['portal patients, db down', 'GET', '/api/appointments/patients', null, [[/FROM PATIENT pt/, dbError]], () => NURSE],
];

characterize('portal patient list: same answers', SNAPSHOT, SCENARIOS);
