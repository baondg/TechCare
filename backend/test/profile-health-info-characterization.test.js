/**
 * Characterization of /api/profile/:userId and the patient-side /api/health-info/:userId over the
 * fake DB (Sequelize model calls are recorded with their options). Snapshot captured before their
 * model access moved into repositories (G3 step B).
 */
process.env.TZ = 'UTC';

const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken, fakeInstance } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'profile-health-info-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const PATIENT = as('PAT', 70);
const OTHER_PATIENT = as('PAT', 80);
const NURSE = as('NUR', 41);
const ADMIN = as('ADM', 1);

/** The target account's role, read before medical staff touch someone else's profile. */
const targetIs = (type) => [[/^SELECT user_id AS userId, type FROM ACCOUNT WHERE user_id = :userId LIMIT 1$/, [{ userId: 70, type }]]];

/** authMiddleware also reads the account (no include): keep it active. */
const activeAccount = { status: 1, getDataValue: () => 1 };

function profileFixtures(s, { account, relative, insurance } = {}) {
  s.models['Account.findOne'] = (opts) => (opts?.include ? account ?? null : activeAccount);
  // Answers one include at a time (relative, insurance) or both together.
  s.models['User.findOne'] = (opts) => {
    const nested = opts?.include?.[0]?.include || [];
    const wantsInsurance = nested.some((i) => i.as === 'insurance');
    const wantsRelative = nested.some((i) => i.as !== 'insurance');
    const patient = {
      ...(wantsRelative && relative !== undefined ? { Relative: relative } : {}),
      ...(wantsInsurance && insurance !== undefined ? { insurance } : {}),
    };
    return Object.keys(patient).length ? { get: () => ({ Patient: patient }) } : null;
  };
}

const ACCOUNT_70 = {
  user_id: 70,
  username: 'bao',
  type: 'PAT',
  User: { dataValues: { idcard: 79123, first_name: ' Bao ', last_name: 'Do', dob: '1990-01-15', sex: 'M', tel: '090', email: 'b@x.vn' } },
};

const PROFILE_BODY = {
  firstName: 'Bảo',
  lastName: 'Đỗ Ngọc',
  dateOfBirth: '1990-01-15',
  sex: 'Male',
  phone: '090',
  email: 'b@x.vn',
  nationalId: '079',
  relativeName: ' Lan ',
  relativeRelationship: '',
  relativeDateOfBirth: '',
  relativeSex: 'Female',
  relativePhone: ' ',
  relativeEmail: 'lan@x.vn',
  relativeNationalId: null,
};

const RECORDS = [
  { id: 1, time: '2026-09-01T08:00:00.000Z', height: '170', weight: '60', blood_pressure: '120/80', heart_rate: 72, respiratory_rate: null, temperature: 37, spo2: 98, condition: 'cough', status: 'SIGNED' },
  { id: 2, time: '2026-09-15T08:00:00.000Z', height: 0, weight: null, blood_pressure: null, heart_rate: null, temperature: null, spo2: null, condition: null, status: null },
];

function patient70(s, fields = {}) {
  s.models['Patient.findOne'] = () =>
    fakeInstance('Patient', { patient_id: 7, user_id: 70, blood_type: 'O+', allergic_info: null, medical_history: null, ...fields }, s);
}

const HEALTH_BODY = {
  height: '170',
  weight: 61.5,
  bloodPressureSys: 120,
  bloodPressureDia: '',
  heartRate: '72',
  respiratoryRate: 'x',
  temperature: '37.2',
  spo2: null,
  currentSymptoms: 'cough',
  bloodType: 'AB-',
  drugAllergies: ['penicillin'],
  foodAllergies: 'not a list',
  chronicConditions: ['asthma'],
  vaccinations: ['BCG'],
  status: 'confirmed',
};

const draftRecord = (s, fields = {}) => () =>
  fakeInstance('MedicalRecord', { id: 3, patient_id: 7, height: 170, weight: 60, status: 'draft', time: '2026-09-01T08:00:00.000Z', ...fields }, s);

const SCENARIOS = [
  // ---- profile: read
  ['profile, bad id', 'GET', '/api/profile/abc', null, [], () => PATIENT],
  ['profile, another patient', 'GET', '/api/profile/70', null, [], () => OTHER_PATIENT],
  ['profile, no account', 'GET', '/api/profile/70', null, [], (s) => {
    profileFixtures(s);
    return PATIENT;
  }],
  ['profile, own with relative + insurance', 'GET', '/api/profile/70', null, [], (s) => {
    profileFixtures(s, { account: ACCOUNT_70, relative: { name: 'Lan', tel: '091' }, insurance: { id: 'HI1', expired_date: '2027-01-01' } });
    return PATIENT;
  }],
  ['profile, staff reads a patient without relative / insurance', 'GET', '/api/profile/70', null, targetIs('PAT'), (s) => {
    profileFixtures(s, { account: { ...ACCOUNT_70, User: undefined, user: { first_name: '', last_name: null, idcard: null } }, relative: null, insurance: null });
    return NURSE;
  }],
  ['profile, staff reads an admin', 'GET', '/api/profile/70', null, targetIs('ADM'), (s) => {
    profileFixtures(s, { account: { ...ACCOUNT_70, type: 'ADM' } });
    return NURSE;
  }],
  ['profile, staff reads another staff member', 'GET', '/api/profile/70', null, targetIs('DOC'), (s) => {
    profileFixtures(s, { account: { ...ACCOUNT_70, type: 'DOC' } });
    return NURSE;
  }],
  ['profile, staff reads a missing account', 'GET', '/api/profile/70', null, [], (s) => {
    profileFixtures(s);
    return NURSE;
  }],
  ['profile, admin', 'GET', '/api/profile/70', null, [], (s) => {
    profileFixtures(s, { account: { user_id: 70, username: 'bao', type: 'PAT' } });
    return ADMIN;
  }],
  ['profile, db down', 'GET', '/api/profile/70', null, [], (s) => {
    s.models['Account.findOne'] = (opts) => (opts?.include ? dbError() : activeAccount);
    return PATIENT;
  }],

  // ---- profile: update / delete
  ['update profile, bad id', 'PUT', '/api/profile/x', PROFILE_BODY, [], () => PATIENT],
  ['update profile, another patient', 'PUT', '/api/profile/70', PROFILE_BODY, [], () => OTHER_PATIENT],
  ['update profile, digits in first name', 'PUT', '/api/profile/70', { ...PROFILE_BODY, firstName: 'B4o' }, [], () => PATIENT],
  ['update profile, missing last name', 'PUT', '/api/profile/70', { ...PROFILE_BODY, lastName: undefined, last_name: ' ' }, [], () => PATIENT],
  ['update profile, missing relative name', 'PUT', '/api/profile/70', { ...PROFILE_BODY, relativeName: '' }, [], () => PATIENT],
  ['update profile, user + relative replaced', 'PUT', '/api/profile/70', PROFILE_BODY, [], (s) => {
    s.models['User.findByPk'] = () => fakeInstance('User', { id: 70 }, s);
    s.models['Patient.findOne'] = () => ({ patient_id: 7 });
    return PATIENT;
  }],
  ['update profile, snake_case names, staff, no patient row', 'PUT', '/api/profile/70', {
    first_name: 'Lan', last_name: "O'Neil", sex: 'x', relativeName: 'Minh', relativeSex: 'Male', relativeRelationship: 'Father',
  }, targetIs('PAT'), (s) => {
    s.models['User.findByPk'] = () => fakeInstance('User', { id: 70 }, s);
    return NURSE;
  }],
  ['update profile, staff edits an admin', 'PUT', '/api/profile/70', PROFILE_BODY, targetIs('ADM'), (s) => {
    s.models['User.findByPk'] = () => fakeInstance('User', { id: 70 }, s);
    return NURSE;
  }],
  ['update profile, relative rejected by the model keeps the old one', 'PUT', '/api/profile/70', { ...PROFILE_BODY, relativeEmail: 'not-an-email' }, [], (s) => {
    s.models['User.findByPk'] = () => fakeInstance('User', { id: 70 }, s);
    s.models['Patient.findOne'] = () => ({ patient_id: 7 });
    s.models['Relative.create'] = () =>
      Object.assign(new Error('Validation isEmail on email failed'), { name: 'SequelizeValidationError', errors: [{ path: 'email' }] });
    return PATIENT;
  }],
  ['update profile, no user row', 'PUT', '/api/profile/70', PROFILE_BODY, [], () => ADMIN],
  ['update profile, db down', 'PUT', '/api/profile/70', PROFILE_BODY, [], (s) => {
    s.models['User.findByPk'] = dbError;
    return PATIENT;
  }],
  ['delete profile, another patient', 'DELETE', '/api/profile/70', null, [], () => OTHER_PATIENT],
  ['delete profile, nurse', 'DELETE', '/api/profile/70', null, [], () => NURSE],
  ['delete profile, own', 'DELETE', '/api/profile/70', null, [], () => PATIENT],

  // ---- health info: read (always the signed-in user's)
  ['health info, no patient row', 'GET', '/api/health-info/70', null, [], () => PATIENT],
  ['health info, records + JSON columns', 'GET', '/api/health-info/999', null, [], (s) => {
    patient70(s, {
      allergic_info: '{"drugAllergies":["penicillin"],"foodAllergies":[]}',
      medical_history: { chronicConditions: ['asthma'], vaccinations: ['BCG'] },
      medicalRecords: RECORDS,
    });
    return PATIENT;
  }],
  ['health info, no records, broken JSON', 'GET', '/api/health-info/70', null, [], (s) => {
    patient70(s, { blood_type: null, allergic_info: '{broken', medical_history: 42, medicalRecords: [] });
    return PATIENT;
  }],
  ['health info, db down', 'GET', '/api/health-info/70', null, [], (s) => {
    s.models['Patient.findOne'] = dbError;
    return PATIENT;
  }],

  // ---- health info: create
  ['create health info, another patient', 'POST', '/api/health-info/70', HEALTH_BODY, [], () => OTHER_PATIENT],
  ['create health info, admin for a patient', 'POST', '/api/health-info/70', HEALTH_BODY, [], (s) => {
    patient70(s);
    return ADMIN;
  }],
  ['create health info, no patient row', 'POST', '/api/health-info/70', HEALTH_BODY, [], () => PATIENT],
  ['create health info', 'POST', '/api/health-info/70', HEALTH_BODY, [], (s) => {
    patient70(s);
    return PATIENT;
  }],
  ['create health info, empty body', 'POST', '/api/health-info/70', {}, [], (s) => {
    patient70(s, { blood_type: 'A+' });
    return PATIENT;
  }],
  ['create health info, db down', 'POST', '/api/health-info/70', HEALTH_BODY, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.create'] = dbError;
    return PATIENT;
  }],

  // ---- health info: update
  ['update health info, another patient', 'PUT', '/api/health-info/70', { id: 3 }, [], () => OTHER_PATIENT],
  ['update health info, no patient row', 'PUT', '/api/health-info/70', { id: 3 }, [], () => PATIENT],
  ['update health info, record not found', 'PUT', '/api/health-info/70', { id: 3 }, [], (s) => {
    patient70(s);
    return PATIENT;
  }],
  ['update health info, confirmed record', 'PUT', '/api/health-info/70', { id: 3 }, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.findOne'] = draftRecord(s, { status: 'signed' });
    return PATIENT;
  }],
  ['update health info', 'PUT', '/api/health-info/70', { id: 3, ...HEALTH_BODY }, [], (s) => {
    patient70(s, { medical_history: '{"chronicConditions":["old"]}' });
    s.models['MedicalRecord.findOne'] = draftRecord(s);
    return PATIENT;
  }],
  ['update health info, keeps height / weight / status', 'PUT', '/api/health-info/70', { id: '3', bloodType: 'Z' }, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.findOne'] = draftRecord(s, { status: null });
    return PATIENT;
  }],

  // ---- health info: confirm / delete
  ['confirm health info, another patient', 'PATCH', '/api/health-info/70/3/confirm', null, [], () => OTHER_PATIENT],
  ['confirm health info, record not found', 'PATCH', '/api/health-info/70/3/confirm', null, [], (s) => {
    patient70(s);
    return PATIENT;
  }],
  ['confirm health info, already confirmed', 'PATCH', '/api/health-info/70/3/confirm', null, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.findOne'] = draftRecord(s, { status: 'confirmed' });
    return PATIENT;
  }],
  ['confirm health info', 'PATCH', '/api/health-info/70/3/confirm', null, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.findOne'] = draftRecord(s);
    return PATIENT;
  }],
  ['delete health info, no ids', 'DELETE', '/api/health-info/70', { ids: [] }, [], (s) => {
    patient70(s);
    return PATIENT;
  }],
  ['delete health info', 'DELETE', '/api/health-info/70', { ids: [1, 2] }, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.destroy'] = () => 2;
    return PATIENT;
  }],
  ['delete health info via POST', 'POST', '/api/health-info/70/delete', { ids: [1] }, [], (s) => {
    patient70(s);
    s.models['MedicalRecord.destroy'] = () => 0;
    return PATIENT;
  }],
  ['delete health info, another patient', 'POST', '/api/health-info/70/delete', { ids: [1] }, [], () => OTHER_PATIENT],
];

/** Records / responses stamped with "now". */
function scrubValue(_key, value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Math.abs(Date.parse(value) - Date.now()) < 5 * 60_000) {
    return '<now>';
  }
  return undefined;
}

characterize('profile + patient health info: same model calls, same answers', SNAPSHOT, SCENARIOS, { scrubValue });
