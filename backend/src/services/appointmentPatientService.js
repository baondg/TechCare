const sequelize = require('../common/database');
const appointmentRepository = require('../repositories/appointmentRepository');
const {
  notifyDoctorPatientBooked,
  notifyDoctorsAfterPatientReschedule,
  notifyDoctorPatientCancelledAppointment,
} = require('./appointmentNotifications');
const cacheService = require('./cacheService');
const { BadRequestError, ConflictError, NotFoundError } = require('../errors/AppError');
const { config } = require('../config/env');

const APPOINTMENTS_LIST_CACHE_TTL_SECONDS = config.cache.appointmentsListTtlSeconds;

function getAppointmentsListCacheKey(patientPk) {
  return `patient:appointments_list:v1:${patientPk}`;
}

async function invalidateAppointmentsListCache(patientPk) {
  const pid = Number(patientPk);
  if (!Number.isFinite(pid) || pid <= 0) return;
  await cacheService.del(getAppointmentsListCacheKey(pid));
}

/**
 * Patient portal: books a slot (an open slot of the doctor at that time and room, else a new
 * appointment), awaiting the doctor's acceptance. With `rescheduleFromAppointmentId` the old booking
 * is released in the same transaction. Required fields are checked by the route validator.
 * Room: `room` by name ("Room " prefix ignored), else the doctor's room, else any clinic room.
 */
async function createAppointment({ userId, body }) {
  const {
    doctor,
    department,
    date,
    time,
    room,
    symptoms,
    notes,
    rescheduleFromAppointmentId,
    rescheduleFromId,
    doctorId: doctorIdBody,
  } = body;

  const doctorPk = Number(doctorIdBody);
  const useDoctorPk = Number.isFinite(doctorPk) && doctorPk > 0;
  const rescheduleFrom = Number(rescheduleFromAppointmentId ?? rescheduleFromId);
  const useReschedule = Number.isFinite(rescheduleFrom) && rescheduleFrom > 0;
  const t = useReschedule ? await sequelize.transaction() : null;

  let id;
  let doctorRow;
  let patientId;
  try {
    patientId = await appointmentRepository.findPatientIdByUserId(userId);
    if (!patientId) throw new BadRequestError('Patient profile not found');

    if (useReschedule && !(await appointmentRepository.findRescheduleSourceAppointment(rescheduleFrom, patientId, t))) {
      throw new BadRequestError('Original appointment not found or cannot be rescheduled');
    }

    doctorRow = useDoctorPk
      ? await appointmentRepository.findDoctorByPrimaryKey(doctorPk)
      : await appointmentRepository.findDoctorByDisplayInput(doctor);
    if (!doctorRow) throw new BadRequestError('Doctor not found');

    const dateTime = `${date} ${String(time).slice(0, 8)}`;
    const normalizedRoomName = String(room || '').trim().replace(/^room\s+/i, '');
    const roomId =
      (normalizedRoomName ? await appointmentRepository.findClinicRoomIdByName(normalizedRoomName, t) : null) ||
      doctorRow.room_id ||
      (await appointmentRepository.findAnyClinicRoomId(t));
    if (!roomId) throw new BadRequestError('No clinic room available to schedule appointment');

    const condition = symptoms || notes || 'General consultation';
    const existingSlot = await appointmentRepository.findScheduledSlotAtDoctorRoomTime(doctorRow.doctor_id, roomId, dateTime, t);
    if (existingSlot?.id) {
      const slotRow = await appointmentRepository.getAppointmentPatientId(existingSlot.id, t);
      if (slotRow?.patientId) throw new ConflictError('This time slot is already booked. Please choose another time.');
      await appointmentRepository.bookPatientOnAppointment(existingSlot.id, patientId, condition, t);
      id = existingSlot.id;
    } else {
      id = await appointmentRepository.insertAppointmentRow(
        { time: dateTime, condition, patientId, doctorId: doctorRow.doctor_id, roomId },
        t
      );
    }

    if (useReschedule) {
      if (Number(id) === rescheduleFrom) throw new BadRequestError('Choose a different time slot to reschedule');
      await appointmentRepository.releaseRescheduleSourceAppointment(rescheduleFrom, patientId, t);
      await t.commit();
    }
  } catch (error) {
    if (t) await t.rollback();
    throw error;
  }

  if (useReschedule) {
    await notifyDoctorsAfterPatientReschedule({ fromAppointmentId: rescheduleFrom, toAppointmentId: id, patientId });
  }
  await notifyDoctorPatientBooked(id);
  await invalidateAppointmentsListCache(patientId);

  return {
    id,
    doctor: `Dr. ${doctorRow.first_name || ''} ${doctorRow.last_name || ''}`.trim(),
    department,
    date,
    time,
    room: room || '',
    symptoms: symptoms || '',
    notes: notes || '',
    status: 'Pending',
    awaitingDoctorConfirmation: true,
  };
}

/** `{ success, appointments }` of the signed-in patient, newest first (cached per patient). */
async function getAppointmentsForUser(userId) {
  const rawPid = await appointmentRepository.findPatientIdByUserId(userId);
  const patientId = Number(rawPid);
  if (!Number.isFinite(patientId) || patientId <= 0) return { success: true, appointments: [] };

  const cacheKey = getAppointmentsListCacheKey(patientId);
  const cachedPayload = await cacheService.getJson(cacheKey);
  if (cachedPayload) return cachedPayload;

  const rows = await appointmentRepository.listPatientAppointmentsForPortal(patientId);
  const appointments = rows.map((r) => {
    const dc = Number(r.doctorConfirmed) !== 0;
    let status;
    if (r.status === 'completed') status = 'Done';
    else if (r.status === 'cancelled') status = 'Cancelled';
    else if (!dc) status = 'Pending';
    else status = 'Upcoming';
    return {
      id: r.id,
      date: r.date,
      time: r.time,
      symptoms: r.symptoms,
      department: r.roomDepartment || r.doctorSpecialty || '',
      room: r.roomName || '',
      doctor: r.doctorName || '',
      status,
      awaitingDoctorConfirmation: r.status === 'scheduled' && !dc,
      notes: '',
    };
  });
  const payload = { success: true, appointments };
  await cacheService.setJson(cacheKey, payload, APPOINTMENTS_LIST_CACHE_TTL_SECONDS);
  return payload;
}

const PORTAL_STATUS_TO_DB = {
  Cancelled: 'cancelled',
  Done: 'completed',
  Upcoming: 'scheduled',
  Confirmed: 'scheduled',
  Pending: 'scheduled',
  Rejected: 'cancelled',
};

/**
 * Patient changes the status of their appointment (portal labels or raw DB status). Cancelling
 * needs a reason and notifies the doctor. Returns `{ id, status }` (the label sent, default 'Upcoming').
 */
async function updatePatientAppointment({ userId, id, body }) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) throw new NotFoundError('Patient profile not found');
  const apptRow = await appointmentRepository.findPatientAppointmentSummary(Number(id), patientId);
  if (!apptRow?.apptId) throw new NotFoundError('Appointment not found or access denied');

  const nextStatus = body.status ? PORTAL_STATUS_TO_DB[body.status] || String(body.status).toLowerCase() : null;
  const currentStatus = String(apptRow.apptStatus || '').toLowerCase();

  if (nextStatus === 'cancelled') {
    const reason = String(body.cancellationReason ?? body.reason ?? '').trim();
    if (!reason) throw new BadRequestError('Cancellation reason is required');
    if (apptRow.apptStatus && currentStatus !== 'cancelled') {
      await notifyDoctorPatientCancelledAppointment(id, reason);
    }
    await appointmentRepository.setAppointmentCancelledWithReason(id, patientId, reason);
    await invalidateAppointmentsListCache(patientId);
    return { id: Number(id), status: 'Cancelled' };
  }

  if (nextStatus && currentStatus !== nextStatus) {
    await appointmentRepository.setAppointmentStatusIfDifferent(id, patientId, nextStatus);
    await invalidateAppointmentsListCache(patientId);
  }
  return { id: Number(id), status: body.status || 'Upcoming' };
}

/** Patient cancels their appointment (reason checked by the route validator) and the doctor is told. */
async function deletePatientAppointment({ userId, id, body }) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  const reason = String(body.cancellationReason ?? body.reason).trim();
  if (!(await appointmentRepository.findOwnedAppointmentId(id, patientId))) {
    throw new NotFoundError('Appointment not found or access denied');
  }
  const current = await appointmentRepository.getAppointmentStatusForPatient(id, patientId);
  if (current?.status && String(current.status).toLowerCase() !== 'cancelled') {
    await notifyDoctorPatientCancelledAppointment(id, reason);
  }
  await appointmentRepository.cancelAppointmentByPatient(id, reason);
  await invalidateAppointmentsListCache(patientId);
}

/** Patient PK for logged-in portal user (recovery / AI routes). */
async function getPatientPkForUserId(userId) {
  return appointmentRepository.findPatientIdByUserId(userId);
}

/** Resolve OP… / numeric route id to patient PK (staff EMR). */
async function getPatientPkFromRouteId(routeId) {
  return appointmentRepository.findPatientPkByRouteId(routeId);
}

module.exports = {
  createAppointment,
  getAppointmentsForUser,
  updatePatientAppointment,
  deletePatientAppointment,
  invalidateAppointmentsListCache,
  getAppointmentsListCacheKey,
  getPatientPkForUserId,
  getPatientPkFromRouteId,
};
