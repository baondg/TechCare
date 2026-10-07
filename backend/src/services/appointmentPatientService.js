const sequelize = require('../common/database');
const appointmentRepository = require('../repositories/appointmentRepository');
const {
  notifyDoctorPatientBooked,
  notifyDoctorsAfterPatientReschedule,
  notifyDoctorPatientCancelledAppointment,
} = require('./appointmentNotifications');
const cacheService = require('./cacheService');
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
 * Patient portal: book or reschedule appointment.
 * @returns {{ ok: true, status: number, json: object } | { ok: false, status: number, json: object }}
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
  if ((!doctor && !useDoctorPk) || !department || !date || !time) {
    return { ok: false, status: 400, json: { message: 'Missing required fields' } };
  }

  const rescheduleFrom = Number(rescheduleFromAppointmentId ?? rescheduleFromId);
  const useReschedule = Number.isFinite(rescheduleFrom) && rescheduleFrom > 0;
  const t = useReschedule ? await sequelize.transaction() : null;

  try {
    const patientId = await appointmentRepository.findPatientIdByUserId(userId);
    if (!patientId) {
      if (t) await t.rollback();
      return { ok: false, status: 400, json: { message: 'Patient profile not found' } };
    }

    if (useReschedule) {
      const fc = await appointmentRepository.findRescheduleSourceAppointment(rescheduleFrom, patientId, t);
      if (!fc) {
        await t.rollback();
        return {
          ok: false,
          status: 400,
          json: { message: 'Original appointment not found or cannot be rescheduled' },
        };
      }
    }

    const doctorRow = useDoctorPk
      ? await appointmentRepository.findDoctorByPrimaryKey(doctorPk)
      : await appointmentRepository.findDoctorByDisplayInput(doctor);
    if (!doctorRow) {
      if (t) await t.rollback();
      return { ok: false, status: 400, json: { message: 'Doctor not found' } };
    }

    const dateTime = `${date} ${String(time).slice(0, 8)}`;
    const normalizedRoomName = String(room || '').trim().replace(/^room\s+/i, '');
    let roomId = null;
    if (normalizedRoomName) {
      roomId = await appointmentRepository.findClinicRoomIdByName(normalizedRoomName, t);
    }
    if (!roomId) {
      roomId = doctorRow.room_id || null;
    }
    if (!roomId) {
      roomId = await appointmentRepository.findAnyClinicRoomId(t);
    }
    if (!roomId) {
      if (t) await t.rollback();
      return { ok: false, status: 400, json: { message: 'No clinic room available to schedule appointment' } };
    }

    const existingSlot = await appointmentRepository.findScheduledSlotAtDoctorRoomTime(
      doctorRow.doctor_id,
      roomId,
      dateTime,
      t
    );

    let id;
    if (existingSlot?.id) {
      const slotRow = await appointmentRepository.getAppointmentPatientId(existingSlot.id, t);
      if (slotRow?.patientId) {
        if (t) await t.rollback();
        return {
          ok: false,
          status: 409,
          json: { message: 'This time slot is already booked. Please choose another time.' },
        };
      }
      await appointmentRepository.bookPatientOnAppointment(
        existingSlot.id,
        patientId,
        symptoms || notes || 'General consultation',
        t
      );
      id = existingSlot.id;
    } else {
      id = await appointmentRepository.insertAppointmentRow(
        {
          time: dateTime,
          condition: symptoms || notes || 'General consultation',
          patientId,
          doctorId: doctorRow.doctor_id,
          roomId,
        },
        t
      );
    }

    if (useReschedule) {
      if (Number(id) === rescheduleFrom) {
        await t.rollback();
        return { ok: false, status: 400, json: { message: 'Choose a different time slot to reschedule' } };
      }
      await appointmentRepository.releaseRescheduleSourceAppointment(rescheduleFrom, patientId, t);
      await t.commit();
      await notifyDoctorsAfterPatientReschedule({
        fromAppointmentId: rescheduleFrom,
        toAppointmentId: id,
        patientId,
      });
    }

    await notifyDoctorPatientBooked(id);
    await invalidateAppointmentsListCache(patientId);

    return {
      ok: true,
      status: 201,
      json: {
        success: true,
        appointment: {
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
        },
      },
    };
  } catch (error) {
    if (t) await t.rollback();
    throw error;
  }
}

async function getAppointmentsForUser(userId) {
  const rawPid = await appointmentRepository.findPatientIdByUserId(userId);
  const patientId = Number(rawPid);
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return { ok: true, status: 200, json: { success: true, appointments: [] } };
  }

  const cacheKey = getAppointmentsListCacheKey(patientId);
  const cachedPayload = await cacheService.getJson(cacheKey);
  if (cachedPayload) {
    return { ok: true, status: 200, json: cachedPayload };
  }

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
  return { ok: true, status: 200, json: payload };
}

async function updatePatientAppointment({ userId, id, body }) {
  const apptIdNum = Number(id);
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) {
    return { ok: false, status: 404, json: { message: 'Patient profile not found' } };
  }

  const apptRow = await appointmentRepository.findPatientAppointmentSummary(apptIdNum, patientId);
  if (!apptRow?.apptId) {
    return { ok: false, status: 404, json: { message: 'Appointment not found or access denied' } };
  }

  const statusMap = {
    Cancelled: 'cancelled',
    Done: 'completed',
    Upcoming: 'scheduled',
    Confirmed: 'scheduled',
    Pending: 'scheduled',
    Rejected: 'cancelled',
  };
  const nextStatus = body.status ? (statusMap[body.status] || String(body.status).toLowerCase()) : null;

  if (nextStatus === 'cancelled') {
    const cancellationReason = String(body.cancellationReason ?? body.reason ?? '').trim();
    if (!cancellationReason) {
      return { ok: false, status: 400, json: { message: 'Cancellation reason is required' } };
    }
    const curStatus = apptRow.apptStatus;
    if (curStatus && String(curStatus).toLowerCase() !== 'cancelled') {
      await notifyDoctorPatientCancelledAppointment(id, cancellationReason);
    }
    await appointmentRepository.setAppointmentCancelledWithReason(id, patientId, cancellationReason);
    await invalidateAppointmentsListCache(patientId);
    return { ok: true, status: 200, json: { success: true, appointment: { id: Number(id), status: 'Cancelled' } } };
  }

  if (nextStatus) {
    if (String(apptRow.apptStatus || '').toLowerCase() === String(nextStatus).toLowerCase()) {
      return {
        ok: true,
        status: 200,
        json: { success: true, appointment: { id: Number(id), status: body.status || 'Upcoming' } },
      };
    }
    await appointmentRepository.setAppointmentStatusIfDifferent(id, patientId, nextStatus);
    await invalidateAppointmentsListCache(patientId);
  }
  return {
    ok: true,
    status: 200,
    json: { success: true, appointment: { id: Number(id), status: body.status || 'Upcoming' } },
  };
}

async function deletePatientAppointment({ userId, id, body }) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  const cancellationReason = String(body?.cancellationReason ?? body?.reason ?? '').trim();
  if (!cancellationReason) {
    return { ok: false, status: 400, json: { message: 'Cancellation reason is required' } };
  }
  const own = await appointmentRepository.findOwnedAppointmentId(id, patientId);
  if (!own) {
    return { ok: false, status: 404, json: { message: 'Appointment not found or access denied' } };
  }
  const curDel = await appointmentRepository.getAppointmentStatusForPatient(id, patientId);
  if (curDel?.status && String(curDel.status).toLowerCase() !== 'cancelled') {
    await notifyDoctorPatientCancelledAppointment(id, cancellationReason);
  }
  await appointmentRepository.cancelAppointmentByPatient(id, cancellationReason);
  await invalidateAppointmentsListCache(patientId);
  return { ok: true, status: 200, json: { success: true, message: 'Appointment deleted successfully' } };
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
