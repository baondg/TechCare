/**
 * Characterization of the doctor-side appointment endpoints (/api/doctor/appointments*) over the
 * fake DB, including the patient / doctor notifications they send. Snapshot captured before their
 * SQL moved into repositories (G3 step B, doctor batch 4).
 */
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'doctor-appointments-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const DOCTOR = as('DOC', 21);

/** The signed-in user (USER 21) is DOCTOR 5. */
const MY_DOCTOR = [/^SELECT doctor_id FROM DOCTOR WHERE user_id/, [{ doctor_id: 5 }]];
const SUMMARY = [/AS doctorId, DATE_FORMAT\(a.time/, [{
  id: 11, patientId: 7, doctorId: 6, dateVi: '01/10/2026', timeVi: '09:30', department: 'Cardiology', doctorLabel: 'Le An', patientLabel: 'Bao Do',
}]];
const PATIENT_USER = [/^SELECT user_id AS uid FROM PATIENT/, [{ uid: 70 }]];
const DOCTOR_USER = [/^SELECT user_id AS uid FROM DOCTOR/, [{ uid: 60 }]];

const LIST_ROWS = [
  { id: 1, date: '2026-10-01', time: '09:30:00', dbStatus: 'scheduled', effectiveStatus: 'scheduled', doctorConfirmed: 0, symptoms: 'cough', notes: '', room: 'R1', department: 'Cardiology', patientId: 7, userId: '70', patientName: 'Bao Do' },
  { id: 2, date: '2026-10-01', time: '10:00:00', dbStatus: 'scheduled', effectiveStatus: 'completed', doctorConfirmed: '1', symptoms: null, room: null, department: null, patientId: 8, userId: 80, patientName: 'An' },
  { id: 3, date: '2026-10-02', time: '08:00:00', dbStatus: 'CANCELLED', effectiveStatus: null, doctorConfirmed: 1, patientId: 9, userId: 90, patientName: 'C' },
  { id: 4, date: '2026-10-02', time: '08:30:00', dbStatus: 'scheduled', effectiveStatus: 'scheduled', doctorConfirmed: 0, patientId: null, userId: null, patientName: 'patient#null' },
];

/** Cover of appointment 11 (DOCTOR 5, room 3, booked by patient 7) to DOCTOR 6. */
const COVER_APPT = [/WHERE a.id = :id AND a.doctor_id = :myDoctorId/, [{ id: 11, patientId: 7, doctorId: 5, roomId: '3', slotTime: '2026-10-01T09:30:00.000Z', status: 'scheduled' }]];
const SLOT_DEPT = (deptId) => [/^SELECT cr.department_id AS deptId FROM APPOINTMENT a/, [{ deptId }]];
const IN_SLOT_DEPT = [/FROM DOCTOR_DEPARTMENT WHERE doctor_id = :did AND department_id = :deptId/, [{ ok: 1 }]];
const DOCTOR_NAMES = [/AS name FROM DOCTOR d JOIN USER u/, (call) => (call.replacements.did === 5 ? [{ name: ' Hoa Tran ' }] : [{ name: 'Le An' }])];
const COVER = { reason: 'Conference', coverDoctorId: 6 };

const CANCEL_ROW = (row) => [/AS dc, status FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId/, [row]];
const DECLINE_ROW = (row) => [/AS doctorNameRaw/, [row]];

const SCENARIOS = [
  // ---- list
  ['appointments, no doctor profile', 'GET', '/api/doctor/appointments', null, [], () => DOCTOR],
  ['appointments, all statuses mapped', 'GET', '/api/doctor/appointments', null, [MY_DOCTOR, [/AS effectiveStatus/, LIST_ROWS]], () => DOCTOR],
  ['appointments, pending in a date range', 'GET', '/api/doctor/appointments?status=Upcoming&startDate=2026-10-01&endDate=2026-10-31', null, [MY_DOCTOR], () => DOCTOR],
  ['appointments, done', 'GET', '/api/doctor/appointments?status=done', null, [MY_DOCTOR], () => DOCTOR],
  ['appointments, rejected', 'GET', '/api/doctor/appointments?status=rejected', null, [MY_DOCTOR], () => DOCTOR],
  ['appointments, unknown status', 'GET', '/api/doctor/appointments?status=whatever', null, [MY_DOCTOR], () => DOCTOR],
  ['appointments, db down', 'GET', '/api/doctor/appointments', null, [MY_DOCTOR, [/AS effectiveStatus/, dbError]], () => DOCTOR],

  // ---- create
  ['create, missing fields', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', date: '2026-10-01' }, [], () => DOCTOR],
  ['create, no doctor profile', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30' }, [], () => DOCTOR],
  ['create, unknown patient', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30' }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5, room_id: 2 }]],
  ], () => DOCTOR],
  ['create, slot taken', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30:00.000' }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5, room_id: 2 }]],
    [/^SELECT patient_id FROM PATIENT WHERE user_id/, [{ patient_id: 7 }]],
    [/AND time = :dateTime AND status = 'scheduled'/, [{ id: 10 }]],
  ], () => DOCTOR],
  ['create, in the doctor\'s room', 'POST', '/api/doctor/appointments', {
    patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30', room: 'R9', notes: 'n',
  }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5, room_id: 2 }]],
    [/^SELECT patient_id FROM PATIENT WHERE user_id/, [{ patient_id: 7 }]],
    [/^INSERT INTO APPOINTMENT/, [301, 1]],
  ], () => DOCTOR],
  ['create, room by name', 'POST', '/api/doctor/appointments', {
    patientId: '70', department: 'Cardiology', date: '2026-10-01', time: '09:30', room: 'R9', symptoms: 'fever',
  }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5, room_id: null }]],
    [/^SELECT patient_id FROM PATIENT WHERE user_id/, [{ patient_id: 7 }]],
    [/^SELECT id FROM CLINIC_ROOM WHERE name/, [{ id: 9 }]],
    [/^INSERT INTO APPOINTMENT/, [302, 1]],
  ], () => DOCTOR],
  ['create, fallback room', 'POST', '/api/doctor/appointments', {
    patientId: 'op70', department: 'Cardiology', date: '2026-10-01', time: '09:30', room: 'gone',
  }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5 }]],
    [/^SELECT patient_id FROM PATIENT WHERE user_id/, [{ patient_id: 7 }]],
    [/^SELECT id FROM CLINIC_ROOM LIMIT 1/, [{ id: 1 }]],
    [/^INSERT INTO APPOINTMENT/, [303, 1]],
  ], () => DOCTOR],
  ['create, no clinic room', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30' }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, [{ doctor_id: 5 }]],
    [/^SELECT patient_id FROM PATIENT WHERE user_id/, [{ patient_id: 7 }]],
  ], () => DOCTOR],
  ['create, db down', 'POST', '/api/doctor/appointments', { patientId: 'OP0070', department: 'Cardiology', date: '2026-10-01', time: '09:30' }, [
    [/^SELECT doctor_id, room_id FROM DOCTOR/, dbError],
  ], () => DOCTOR],

  // ---- cover
  ['cover, no reason', 'PUT', '/api/doctor/appointments/11/cover', { reason: ' ', coverDoctorId: 6 }, [], () => DOCTOR],
  ['cover, no cover doctor', 'PUT', '/api/doctor/appointments/11/cover', { coverReason: 'Sick', coverDoctorId: 'x' }, [], () => DOCTOR],
  ['cover, no doctor profile', 'PUT', '/api/doctor/appointments/11/cover', COVER, [], () => DOCTOR],
  ['cover, appointment not found', 'PUT', '/api/doctor/appointments/11/cover', COVER, [MY_DOCTOR], () => DOCTOR],
  ['cover, same doctor', 'PUT', '/api/doctor/appointments/11/cover', { reason: 'r', coverDoctorId: 5 }, [MY_DOCTOR, COVER_APPT], () => DOCTOR],
  ['cover, doctor outside the room department', 'PUT', '/api/doctor/appointments/11/cover', COVER, [MY_DOCTOR, COVER_APPT, SLOT_DEPT('4')], () => DOCTOR],
  ['cover, no room department and no shared department', 'PUT', '/api/doctor/appointments/11/cover', COVER, [MY_DOCTOR, COVER_APPT, SLOT_DEPT(null)], () => DOCTOR],
  ['cover, cover doctor busy at that time', 'PUT', '/api/doctor/appointments/11/cover', COVER, [
    MY_DOCTOR, COVER_APPT, SLOT_DEPT(4), IN_SLOT_DEPT, [/AND x.status = 'scheduled'/, [{ id: 12 }]],
  ], () => DOCTOR],
  ['cover, time + room already used by cover doctor', 'PUT', '/api/doctor/appointments/11/cover', COVER, [
    MY_DOCTOR, COVER_APPT, SLOT_DEPT(4), IN_SLOT_DEPT, [/AND x.room_id =/, [{ id: 13 }]],
  ], () => DOCTOR],
  ['cover, booked slot: patient + new doctor notified', 'PUT', '/api/doctor/appointments/11/cover', COVER, [
    MY_DOCTOR, COVER_APPT, SLOT_DEPT(4), IN_SLOT_DEPT, DOCTOR_NAMES,
    [/AS depName FROM APPOINTMENT a JOIN CLINIC_ROOM/, [{ dateVi: '01/10/2026', timeVi: '09:30', depName: 'Cardiology' }]],
    SUMMARY, PATIENT_USER, DOCTOR_USER,
  ], () => DOCTOR],
  ['cover, open slot via shared department, names unknown', 'PUT', '/api/doctor/appointments/11/cover', { coverReason: 'Leave', coverDoctorId: '6' }, [
    MY_DOCTOR,
    [/WHERE a.id = :id AND a.doctor_id = :myDoctorId/, [{ id: 11, patientId: null, doctorId: 5, roomId: null, status: 'scheduled' }]],
    [/FROM DOCTOR_DEPARTMENT dd1/, [{ ok: 1 }]],
    [/AS doctorId, DATE_FORMAT\(a.time/, [{ id: 11, patientId: null, doctorId: 6, dateVi: '01/10/2026', timeVi: '09:30', department: '' }]],
    DOCTOR_USER,
  ], () => DOCTOR],
  ['cover, db down', 'PUT', '/api/doctor/appointments/11/cover', COVER, [MY_DOCTOR, [/APPOINTMENT/, dbError]], () => DOCTOR],

  // ---- cancel
  ['cancel, no reason', 'PUT', '/api/doctor/appointments/11/cancel', {}, [], () => DOCTOR],
  ['cancel, not found', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [], () => DOCTOR],
  ['cancel, not scheduled', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: 1, status: 'completed' })], () => DOCTOR],
  ['cancel, not yet accepted', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: '0', status: 'Scheduled' })], () => DOCTOR],
  ['cancel, open slot', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: null, dc: 1, status: 'scheduled' })], () => DOCTOR],
  ['cancel, patient notified', 'PUT', '/api/doctor/appointments/11/cancel', { reason: ' Sick ' }, [
    MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: 1, status: 'scheduled' }), SUMMARY, PATIENT_USER,
  ], () => DOCTOR],
  ['cancel, notification fails silently', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [
    MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: 1, status: 'scheduled' }), [/AS doctorId, DATE_FORMAT\(a.time/, dbError],
  ], () => DOCTOR],
  ['cancel, db down', 'PUT', '/api/doctor/appointments/11/cancel', { reason: 'Sick' }, [MY_DOCTOR, [/APPOINTMENT/, dbError]], () => DOCTOR],

  // ---- decline
  ['decline, no reason', 'PUT', '/api/doctor/appointments/11/decline', { reason: '' }, [], () => DOCTOR],
  ['decline, not found', 'PUT', '/api/doctor/appointments/11/decline', { reason: 'Full' }, [MY_DOCTOR], () => DOCTOR],
  ['decline, already accepted', 'PUT', '/api/doctor/appointments/11/decline', { reason: 'Full' }, [MY_DOCTOR, DECLINE_ROW({ patientPk: 7, dc: 1, status: 'scheduled' })], () => DOCTOR],
  ['decline, patient notified', 'PUT', '/api/doctor/appointments/11/decline', { reason: 'Full' }, [
    MY_DOCTOR,
    DECLINE_ROW({ patientPk: '7', dc: 0, status: 'scheduled', dateVi: '01/10/2026', timeVi: '09:30', depName: 'Cardiology', doctorNameRaw: ' Hoa Tran ' }),
    PATIENT_USER,
  ], () => DOCTOR],
  ['decline, no doctor name, patient without account', 'PUT', '/api/doctor/appointments/11/decline', { reason: 'Full' }, [
    MY_DOCTOR, DECLINE_ROW({ patientPk: 7, dc: '0', status: 'SCHEDULED', doctorNameRaw: null }),
  ], () => DOCTOR],
  ['decline, db down', 'PUT', '/api/doctor/appointments/11/decline', { reason: 'Full' }, [MY_DOCTOR, [/^UPDATE APPOINTMENT/, dbError], DECLINE_ROW({ patientPk: 7, dc: 0, status: 'scheduled' })], () => DOCTOR],

  // ---- confirm
  ['confirm, not found', 'PUT', '/api/doctor/appointments/11/confirm', null, [MY_DOCTOR], () => DOCTOR],
  ['confirm, open slot', 'PUT', '/api/doctor/appointments/11/confirm', null, [MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: null, dc: 0, status: 'scheduled' })], () => DOCTOR],
  ['confirm, already confirmed', 'PUT', '/api/doctor/appointments/11/confirm', null, [MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: 1, status: 'scheduled' })], () => DOCTOR],
  ['confirm, patient notified', 'PUT', '/api/doctor/appointments/11/confirm', null, [
    MY_DOCTOR, CANCEL_ROW({ id: 11, patientPk: 7, dc: 0, status: 'scheduled' }), SUMMARY, PATIENT_USER,
  ], () => DOCTOR],
  ['confirm, db down', 'PUT', '/api/doctor/appointments/11/confirm', null, [[/DOCTOR/, dbError]], () => DOCTOR],
];

characterize('doctor appointments: same DB calls, same answers', SNAPSHOT, SCENARIOS);
