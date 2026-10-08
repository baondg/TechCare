/**
 * Characterization of the slot endpoints (booked / open slots, nurse create / update / cancel) and
 * nurse check-in (options, accept, assign walk-in, reschedule, legacy checkout) over the fake DB.
 * Snapshot captured before appointmentSlotService / appointmentNurseService moved to AppError.
 */
const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'appointment-slots-nurse-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const NURSE = as('NUR', 41);
const PATIENT = as('PAT', 70);
const DOCTOR = as('DOC', 21);
const ADMIN = as('ADM', 1);

// ---- slots
const SLOT_ROWS = [
  { id: '1', date: '2026-10-01', time: '09:30:00', doctorId: '5', doctorName: 'Hoa Tran', department: 'Cardiology', roomId: '2', roomName: 'R2', patientId: null, dbStatus: 'scheduled' },
  { id: 2, date: '2026-10-01', time: '10:00:00', doctorId: 5, patientId: 7, patientUserId: '70', patientName: 'Bao', dbStatus: 'scheduled' },
  { id: 3, time: null, doctorId: 6, roomId: null, patientId: 8, dbStatus: 'cancelled' },
];
const SLOT_11 = (fields = {}) => [/FROM APPOINTMENT WHERE id = :id LIMIT 1$/, [{ id: 11, patientId: null, doctorId: 5, roomId: 2, slotTime: '2026-10-01 09:30:00', status: 'scheduled', ...fields }]];
const DOCTOR_NAMES = [/AS name FROM DOCTOR d JOIN USER u/, (call) => (call.replacements.did === 5 ? [{ name: ' Hoa Tran ' }] : [])];

// ---- nurse check-in: route OP0070 → patient 7
const PATIENT_7 = [/^SELECT patient_id AS id FROM PATIENT WHERE user_id = :n LIMIT 1$/, [{ id: 7 }]];
const APPT_ROW = (fields = {}) => ({
  id: 11, slotTime: '2026-10-01T09:30:00.000Z', wallDate: '2026-10-01', wallTime: '09:30:00.000', doctorId: '5', doctorName: 'Hoa Tran', department: 'Cardiology', roomId: '2', roomName: 'R2', conditionNote: 'cough', ...fields,
});
const OPEN_REGIMEN_NONE = [/^SELECT id FROM REGIMEN WHERE patient_id = :patientId AND `end` IS NULL/, []];
const LATEST_DISEASE = [/SELECT r.disease_id AS diseaseId/, [{ diseaseId: 300 }]];
const NEW_REGIMEN = [/^INSERT INTO REGIMEN/, [99, 1]];
const DISPLAY = [/WHERE a.id = :appointmentId LIMIT 1$/, [APPT_ROW({ id: 12, roomId: 3 })]];

const SCENARIOS = [
  // ---- booked / open slots
  ['booked slots, no date', 'GET', '/api/appointments/booked-slots', null, [], () => PATIENT],
  ['booked slots', 'GET', '/api/appointments/booked-slots?date=2026-10-01', null, [[/^SELECT/, [{ time: '09:30', doctorId: 5 }]]], () => PATIENT],
  ['open slots, doctor is not allowed', 'GET', '/api/appointments/open-slots', null, [], () => DOCTOR],
  ['open slots, bad date', 'GET', '/api/appointments/open-slots?startDate=01/10/2026', null, [], () => NURSE],
  ['open slots, nurse view in a range', 'GET', '/api/appointments/open-slots?startDate=2026-10-01&endDate=2026-10-07', null, [[/^SELECT/, SLOT_ROWS]], () => NURSE],
  ['open slots, patient view', 'GET', '/api/appointments/open-slots', null, [[/^SELECT/, SLOT_ROWS.slice(0, 1)]], () => PATIENT],
  ['open slots, db down', 'GET', '/api/appointments/open-slots', null, [[/APPOINTMENT/, dbError]], () => ADMIN],

  // ---- create slot
  ['create slot, patient is not allowed', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30' }, [], () => PATIENT],
  ['create slot, missing fields', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01' }, [], () => NURSE],
  ['create slot, unknown department id', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30', departmentId: 9 }, [], () => NURSE],
  ['create slot, unknown department name', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30', department: 'Mars' }, [], () => NURSE],
  ['create slot, room outside the department', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30', departmentId: 1, roomId: 2 }, [
    [/^SELECT id FROM DEPARTMENT WHERE id = :id/, [{ id: 1 }]],
    [/^SELECT department_id AS departmentId FROM CLINIC_ROOM/, [{ departmentId: 3 }]],
  ], () => NURSE],
  ['create slot, department without rooms', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30', department: 'Cardiology' }, [
    [/FROM DEPARTMENT WHERE/, [{ id: 1 }]],
  ], () => NURSE],
  ['create slot, room from the department', 'POST', '/api/appointments/open-slots', { doctorId: '5', date: '2026-10-01', time: '09:30:59', department: 'Cardiology', condition: ' Morning ' }, [
    [/FROM DEPARTMENT WHERE/, [{ id: 1 }]],
    [/^SELECT id FROM CLINIC_ROOM WHERE department_id = :deptId/, [{ id: 4 }]],
    [/^INSERT INTO APPOINTMENT/, [401, 1]],
  ], () => ADMIN],
  ['create slot, doctor\'s room, already exists', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30' }, [
    [/^SELECT room_id FROM DOCTOR WHERE doctor_id/, [{ room_id: 2 }]],
    [/WHERE doctor_id = :doctorId AND room_id = :roomId AND time = :dt/, [{ id: 10 }]],
  ], () => NURSE],
  ['create slot, any room', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30' }, [
    [/^SELECT id FROM CLINIC_ROOM LIMIT 1/, [{ id: 1 }]], [/^INSERT INTO APPOINTMENT/, [402, 1]],
  ], () => NURSE],
  ['create slot, no room at all', 'POST', '/api/appointments/open-slots', { doctorId: 5, date: '2026-10-01', time: '09:30' }, [], () => NURSE],

  // ---- update slot
  ['update slot, bad id', 'PUT', '/api/appointments/open-slots/x', {}, [], () => NURSE],
  ['update slot, not found', 'PUT', '/api/appointments/open-slots/11', {}, [], () => NURSE],
  ['update slot, cancelled', 'PUT', '/api/appointments/open-slots/11', {}, [SLOT_11({ status: 'CANCELLED' })], () => NURSE],
  ['update slot, unreadable time', 'PUT', '/api/appointments/open-slots/11', {}, [SLOT_11({ slotTime: 'soon' })], () => NURSE],
  ['update slot, time + room only', 'PUT', '/api/appointments/open-slots/11', { date: '2026-10-02', time: '10:15', roomId: '3' }, [SLOT_11()], () => NURSE],
  ['update slot, booked: covering doctor outside the department', 'PUT', '/api/appointments/open-slots/11', { doctorId: 6 }, [SLOT_11({ patientId: 7 })], () => NURSE],
  ['update slot, covering doctor busy', 'PUT', '/api/appointments/open-slots/11', { doctorId: 6 }, [
    SLOT_11(), [/AND status = 'scheduled' AND id <> :id/, [{ id: 12 }]],
  ], () => NURSE],
  ['update slot, booked: new doctor and patient notified', 'PUT', '/api/appointments/open-slots/11', { doctorId: '6', roomId: '' }, [
    SLOT_11({ patientId: 7, slotTime: '2026-10-01T09:30:00' }),
    [/^SELECT room_id AS roomId FROM DOCTOR/, [{ roomId: 8 }]],
    [/FROM DOCTOR_DEPARTMENT dd1/, [{ ok: 1 }]],
    DOCTOR_NAMES,
    [/AS depName FROM APPOINTMENT a JOIN CLINIC_ROOM/, [{ depName: 'Cardiology' }]],
    [/^SELECT user_id AS uid FROM PATIENT/, [{ uid: 70 }]],
    [/AS doctorId, DATE_FORMAT\(a.time/, [{ id: 11, patientId: 7, doctorId: 6, dateVi: '01/10/2026', timeVi: '09:30', department: '' }]],
    [/^SELECT user_id AS uid FROM DOCTOR/, [{ uid: 22 }]],
  ], () => ADMIN],
  ['update slot, booked: moved in time, patient notified', 'PUT', '/api/appointments/open-slots/11', { date: '2026-10-02', time: '10:15' }, [
    SLOT_11({ patientId: 7 }),
    [/AS doctorId, DATE_FORMAT\(a.time/, [{ id: 11, patientId: 7, doctorId: 5, dateVi: '02/10/2026', timeVi: '10:15', department: 'Cardiology' }]],
    [/^SELECT user_id AS uid FROM PATIENT/, [{ uid: 70 }]],
  ], () => NURSE],
  ['update slot, booked: room only, patient notified', 'PUT', '/api/appointments/open-slots/11', { roomId: '3' }, [
    SLOT_11({ patientId: 7 }),
    [/AS doctorId, DATE_FORMAT\(a.time/, [{ id: 11, patientId: 7, doctorId: 5, dateVi: '01/10/2026', timeVi: '09:30', department: '' }]],
    [/^SELECT user_id AS uid FROM PATIENT/, [{ uid: 70 }]],
  ], () => NURSE],
  ['update slot, booked: nothing changed, nobody notified', 'PUT', '/api/appointments/open-slots/11', {}, [SLOT_11({ patientId: 7 })], () => NURSE],
  ['update slot, db down', 'PUT', '/api/appointments/open-slots/11', {}, [[/APPOINTMENT/, dbError]], () => NURSE],

  // ---- cancel slot
  ['delete slot, bad id', 'DELETE', '/api/appointments/open-slots/x', null, [], () => NURSE],
  ['delete slot, not found', 'DELETE', '/api/appointments/open-slots/11', null, [], () => NURSE],
  ['delete slot, booked', 'DELETE', '/api/appointments/open-slots/11', null, [[/^SELECT id, patient_id AS patientId FROM APPOINTMENT/, [{ id: 11, patientId: 7 }]]], () => NURSE],
  ['delete slot', 'DELETE', '/api/appointments/open-slots/11', null, [[/^SELECT id, patient_id AS patientId FROM APPOINTMENT/, [{ id: 11, patientId: null }]]], () => NURSE],

  // ---- nurse check-in: options
  ['check-in options, doctor is not allowed', 'GET', '/api/appointments/nurse/check-in-options?patientId=OP0070', null, [], () => DOCTOR],
  ['check-in options, no patient id', 'GET', '/api/appointments/nurse/check-in-options', null, [], () => NURSE],
  ['check-in options, unknown patient', 'GET', '/api/appointments/nurse/check-in-options?patientId=OP0070', null, [], () => NURSE],
  ['check-in options, bookings + hinted appointment + open slots', 'GET', '/api/appointments/nurse/check-in-options?patientId=OP0070&patientPk=7&appointmentId=13', null, [
    [/^SELECT patient_id AS id FROM PATIENT WHERE patient_id = :pk/, [{ id: 7 }]],
    [/WHERE a.id = :appointmentId AND a.status = 'scheduled'/, [APPT_ROW({ id: 13, slotTime: '2026-10-01T08:00:00.000Z', wallTime: '08:00' })]],
    [/WHERE a.status = 'scheduled' AND DATE\(a.time\) = :clinicToday AND \(/, [APPT_ROW(), APPT_ROW({ id: 10, slotTime: '2026-10-01T09:30:00.000Z', wallDate: null, wallTime: null })]],
    [/WHERE a.patient_id IS NULL/, [APPT_ROW({ id: 20, roomId: null, conditionNote: null })]],
  ], () => NURSE],

  // ---- accept
  ['accept, unknown patient', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11 }, [], () => NURSE],
  ['accept, no appointment today', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11 }, [PATIENT_7], () => NURSE],
  ['accept, invalid room', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11, roomId: 9 }, [
    PATIENT_7, [/WHERE a.id = :appointmentId AND/, [APPT_ROW()]],
  ], () => NURSE],
  ['accept, opens a visit and moves the room', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: '70', appointmentId: '11', roomId: '3' }, [
    PATIENT_7, [/^SELECT id FROM CLINIC_ROOM WHERE id = :roomId/, [{ id: 3 }]],
    [/WHERE a.id = :appointmentId AND/, [APPT_ROW()]],
    OPEN_REGIMEN_NONE, LATEST_DISEASE, NEW_REGIMEN, DISPLAY,
  ], () => NURSE],
  ['accept, linked visit still open', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11 }, [
    PATIENT_7, [/WHERE a.id = :appointmentId AND/, [APPT_ROW({ regimenId: '98' })]],
    [/^SELECT id FROM REGIMEN WHERE id = :regimenId/, [{ id: 98 }]],
  ], () => ADMIN],
  ['accept, linked visit closed, reuses another open visit', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11 }, [
    PATIENT_7, [/WHERE a.id = :appointmentId AND/, [APPT_ROW({ regimenId: 98 })]],
    [/^SELECT id FROM REGIMEN WHERE patient_id = :patientId AND `end` IS NULL/, [{ id: 97 }]],
  ], () => NURSE],
  ['accept, db down rolls back', 'POST', '/api/appointments/nurse/check-in-accept', { patientId: 'OP0070', appointmentId: 11 }, [
    PATIENT_7, [/WHERE a.id = :appointmentId AND/, [APPT_ROW()]], [/FROM REGIMEN/, dbError],
  ], () => NURSE],

  // ---- assign walk-in
  ['assign, slot not open', 'POST', '/api/appointments/nurse/check-in-assign', { patientId: 'OP0070', appointmentId: 20 }, [PATIENT_7], () => NURSE],
  ['assign, lost the race', 'POST', '/api/appointments/nurse/check-in-assign', { patientId: 'OP0070', appointmentId: 20 }, [
    PATIENT_7, [/^SELECT id, patient_id AS patientId, status FROM APPOINTMENT/, [{ id: 20, patientId: null, status: 'scheduled' }]],
    [/^SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :appointmentId/, [{ patientId: 8 }]],
  ], () => NURSE],
  ['assign, walk-in checked in (no disease yet)', 'POST', '/api/appointments/nurse/check-in-assign', { patientId: 'OP0070', appointmentId: 20, condition: ' ' }, [
    PATIENT_7, [/^SELECT id, patient_id AS patientId, status FROM APPOINTMENT/, [{ id: 20, patientId: null, status: 'scheduled' }]],
    [/^SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :appointmentId/, [{ patientId: '7' }]],
    OPEN_REGIMEN_NONE, [/^INSERT INTO DISEASE/, [301, 1]], NEW_REGIMEN,
  ], () => NURSE],

  // ---- reschedule
  ['reschedule, same slot', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 11 }, [], () => NURSE],
  ['reschedule, unknown patient', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 12 }, [], () => NURSE],
  ['reschedule, current appointment not found', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 12 }, [PATIENT_7], () => NURSE],
  ['reschedule, target not open', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 12 }, [
    PATIENT_7, [/AS cond, status/, [{ id: 11, patientId: 7, cond: 'cough', status: 'scheduled' }]],
  ], () => NURSE],
  ['reschedule, assignment failed', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 12 }, [
    PATIENT_7, [/AS cond, status/, [{ id: 11, patientId: 7, cond: '', status: 'scheduled' }]],
    [/^SELECT id, patient_id AS patientId, status FROM APPOINTMENT/, [{ id: 12, patientId: null, status: 'scheduled' }]],
  ], () => NURSE],
  ['reschedule, moved and doctors notified', 'POST', '/api/appointments/nurse/check-in-reschedule', { patientId: 'OP0070', fromAppointmentId: 11, toAppointmentId: 12 }, [
    PATIENT_7, [/AS cond, status/, [{ id: 11, patientId: 7, cond: 'cough', status: 'scheduled' }]],
    [/^SELECT id, patient_id AS patientId, status FROM APPOINTMENT/, [{ id: 12, patientId: null, status: 'scheduled' }]],
    [/^SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :appointmentId/, [{ patientId: 7 }]],
    [/^SELECT id FROM REGIMEN WHERE patient_id = :patientId AND `end` IS NULL/, [{ id: 97 }]],
    DISPLAY,
    [/AS doctorId, DATE_FORMAT\(a.time/, (call) => [{ id: call.replacements.id, patientId: 7, doctorId: call.replacements.id === 11 ? 5 : 6, dateVi: '01/10/2026', timeVi: '09:30', department: 'Cardiology' }]],
    [/^SELECT user_id AS uid FROM DOCTOR/, (call) => [{ uid: call.replacements.did === 5 ? 21 : 22 }]],
  ], () => NURSE],

  // ---- legacy checkout
  ['checkout, unknown patient', 'POST', '/api/appointments/nurse/regimen/checkout', { patientId: 'OP0070', regimenId: 99 }, [], () => NURSE],
  ['checkout, no open visit', 'POST', '/api/appointments/nurse/regimen/checkout', { patientId: 'OP0070', regimenId: 99 }, [PATIENT_7], () => NURSE],
  ['checkout', 'POST', '/api/appointments/nurse/regimen/checkout', { patientId: 'OP0070', regimenId: '99' }, [
    PATIENT_7, [/^SELECT id FROM REGIMEN WHERE id = :regimenId/, [{ id: 99 }]],
  ], () => ADMIN],
];

/** "today" comes from the clinic clock. */
function scrubValue(key, value) {
  if (key === 'today' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return '<today>';
  return undefined;
}

characterize('slots + nurse check-in: same DB calls, same answers', SNAPSHOT, SCENARIOS, { scrubValue });
