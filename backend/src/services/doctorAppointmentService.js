const doctorAppointmentRepository = require('../repositories/doctorAppointmentRepository');
const appointmentRepository = require('../repositories/appointmentRepository');
const { inTransaction } = require('../common/transaction');
const coverRepository = require('../repositories/coverRepository');
const staffRepository = require('../repositories/staffRepository');
const { BadRequestError, ConflictError, ForbiddenError, NotFoundError } = require('../errors/AppError');
const {
  notifyDoctorReceivedCoverAppointment,
  notifyPatientAppointmentDoctorReassigned,
  notifyPatientDoctorAcceptedBooking,
  notifyPatientDoctorCover,
  notifyPatientDoctorDeclinedBooking,
} = require('./appointmentNotifications');

/** `?status=` of the list → DB status group (unknown values: no filter). */
const LIST_STATUS_GROUPS = {
  pending: 'scheduled',
  confirmed: 'scheduled',
  upcoming: 'scheduled',
  done: 'completed',
  completed: 'completed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
};

/** One row of the doctor's schedule as the UI shows it. */
function toScheduleItem(row, user, doctorId) {
  const effectiveStatus = String(row.effectiveStatus || row.dbStatus || '').toLowerCase();
  const confirmed = Number(row.doctorConfirmed) !== 0;
  const isDone = effectiveStatus === 'completed';
  const isCancelled = effectiveStatus === 'cancelled';
  return {
    id: row.id,
    userId: Number(row.userId),
    patientId: Number(row.patientId),
    patientName: row.patientName,
    doctor: user.username || '',
    assignedDoctorId: Number(doctorId),
    department: row.department || '',
    date: row.date,
    time: row.time,
    room: row.room || '',
    symptoms: row.symptoms || '',
    notes: row.notes || '',
    doctorConfirmed: confirmed,
    awaitingDoctorConfirmation:
      !isDone && !isCancelled && effectiveStatus === 'scheduled' && row.patientId != null && !confirmed,
    examined: isDone,
    status: isDone ? 'Done' : isCancelled ? 'Cancelled' : 'Pending',
  };
}

/** The signed-in doctor's appointments (none for a user without a DOCTOR row). */
async function listAppointments(user, { status, startDate, endDate }) {
  const doctorId = await staffRepository.findDoctorIdByUserId(user.userId);
  if (!doctorId) return [];
  const rows = await doctorAppointmentRepository.listForDoctor(doctorId, {
    startDate: startDate ? String(startDate) : null,
    endDate: endDate ? String(endDate) : null,
    status: status ? LIST_STATUS_GROUPS[String(status).toLowerCase()] || null : null,
  });
  return rows.map((row) => toScheduleItem(row, user, doctorId));
}

/**
 * Books a patient (`patientId` = USER id, "OP…" prefix allowed) with the signed-in doctor, already
 * accepted. Room: the doctor's default room, else `room` by name, else any clinic room.
 * Body: `{ patientId, department, date, time, room?, symptoms?, notes? }`.
 */
async function createAppointment(user, body) {
  const { patientId, department, date, time, room, symptoms, notes } = body;
  if (!patientId || !department || !date || !time) {
    throw new BadRequestError('Patient, department, date and time are required');
  }
  const doctor = await doctorAppointmentRepository.findDoctorWithRoomByUserId(user.userId);
  const doctorId = doctor?.doctor_id;
  if (!doctorId) throw new BadRequestError('Doctor profile not found');
  const patientUserId = Number(String(patientId).replace(/^OP0*/i, ''));
  const patientPk = await appointmentRepository.findPatientIdByUserId(patientUserId);
  if (!patientPk) throw new BadRequestError('Patient profile not found');

  const dateTime = `${date} ${String(time).slice(0, 8)}`;
  if (await doctorAppointmentRepository.hasScheduledAt(doctorId, dateTime)) {
    throw new ConflictError('This time slot is already booked');
  }
  const roomId =
    doctor.room_id ||
    (room ? await appointmentRepository.findClinicRoomIdByName(room) : null) ||
    (await appointmentRepository.findAnyClinicRoomId());
  if (!roomId) throw new BadRequestError('No clinic room available');

  const id = await doctorAppointmentRepository.insertAcceptedAppointment({
    dateTime,
    condition: symptoms || notes || 'General consultation',
    patientPk,
    doctorId,
    roomId,
  });
  return {
    id,
    patientId: patientUserId,
    department,
    date,
    time,
    room: room || '',
    symptoms: symptoms || '',
    notes: notes || '',
    status: 'Pending',
  };
}

const doctorLabel = async (doctorId) => {
  const row = await appointmentRepository.getDoctorDisplayNameRow(doctorId);
  return row?.name ? `Dr. ${String(row.name).trim()}` : `Doctor #${doctorId}`;
};

/**
 * Hands one of the doctor's scheduled appointments to `coverDoctorId`, who must work in the
 * department of the slot's room (or, with no room department, share a department with the doctor)
 * and be free at that time. The room is kept. The patient (if booked) and the new doctor are notified.
 * Body: `{ reason | coverReason, coverDoctorId }`.
 */
async function coverAppointment(user, id, body) {
  const reason = String(body?.reason ?? body?.coverReason ?? '').trim();
  if (!reason) throw new BadRequestError('Reason is required');
  const coverDoctorId = Number(body?.coverDoctorId);
  if (!Number.isFinite(coverDoctorId) || coverDoctorId <= 0) throw new BadRequestError('coverDoctorId is required');
  const myDoctorId = await staffRepository.findDoctorIdByUserId(user.userId);
  if (!myDoctorId) throw new ForbiddenError('Doctor profile not found');

  // Checks and hand-over in one transaction, with the appointment and the covering doctor locked:
  // two concurrent requests can neither both hand over this slot nor both book that doctor.
  const appt = await inTransaction(async (transaction) => {
    const owned = await doctorAppointmentRepository.findScheduledOwnedBy(id, myDoctorId, transaction);
    if (!owned) throw new NotFoundError('Appointment not found');
    if (Number(owned.doctorId) === coverDoctorId) throw new BadRequestError('Choose a different doctor');

    const slotDeptId = await doctorAppointmentRepository.findRoomDepartmentId(id);
    if (slotDeptId) {
      if (!(await doctorAppointmentRepository.doctorInDepartment(coverDoctorId, slotDeptId))) {
        throw new BadRequestError('Covering doctor must work in the same department as this appointment room');
      }
    } else if (!(await appointmentRepository.doctorsShareDepartment(myDoctorId, coverDoctorId))) {
      throw new BadRequestError('Covering doctor must work in the same department as you');
    }

    await doctorAppointmentRepository.lockDoctorSchedule(coverDoctorId, transaction);
    // Keep the booked slot's room: the cover doctor's default room could violate
    // UNIQUE(time, doctor_id, room_id) if they already have (even cancelled) history at that time + room.
    if (await doctorAppointmentRepository.hasOtherScheduledAtSameTime(coverDoctorId, id, transaction)) {
      throw new ConflictError('That doctor already has another appointment at this time');
    }
    if (await doctorAppointmentRepository.hasOtherRowAtSameTimeAndRoom(coverDoctorId, id, transaction)) {
      throw new ConflictError(
        'Cannot assign cover: this time and room are already tied to another record for that doctor'
      );
    }
    await coverRepository.reassignAppointmentDoctor(id, coverDoctorId, transaction);
    return owned;
  });

  const oldDoctorLabel = await doctorLabel(myDoctorId);
  const newDoctorLabel = await doctorLabel(coverDoctorId);

  if (appt.patientId) {
    const slot = await doctorAppointmentRepository.findSlotLabels(id);
    await notifyPatientAppointmentDoctorReassigned({
      patientId: Number(appt.patientId),
      dateVi: slot?.dateVi || '',
      timeVi: slot?.timeVi || '',
      department: slot?.depName || '',
      oldDoctorName: oldDoctorLabel,
      newDoctorName: newDoctorLabel,
      reason,
    });
  }
  await notifyDoctorReceivedCoverAppointment({ appointmentId: Number(id), previousDoctorLabel: oldDoctorLabel });

  const roomId =
    appt.roomId != null && appt.roomId !== '' && Number.isFinite(Number(appt.roomId)) ? Number(appt.roomId) : null;
  return { id: Number(id), doctorId: coverDoctorId, roomId };
}

/** Booking state of one of the signed-in doctor's appointments; 404 when it is not theirs. */
async function requireOwnBooking(user, id, find = doctorAppointmentRepository.findOwnedBookingState) {
  const doctorId = await staffRepository.findDoctorIdByUserId(user.userId);
  const row = doctorId ? await find(id, doctorId) : null;
  if (!row) throw new NotFoundError('Appointment not found');
  return { doctorId, row };
}

const isScheduled = (row) => String(row.status).toLowerCase() === 'scheduled';

/** Cancels an accepted, booked appointment of the doctor and tells the patient why. */
async function cancelAppointment(user, id, body) {
  const reason = String(body?.reason ?? '').trim();
  if (!reason) throw new BadRequestError('Reason is required');
  const { row } = await requireOwnBooking(user, id);
  if (!isScheduled(row)) throw new BadRequestError('Only scheduled visits can be cancelled here');
  if (Number(row.dc) === 0) {
    throw new BadRequestError('This booking is not yet accepted. Use Decline to release the slot, or Accept first.');
  }
  if (row.patientPk == null) throw new BadRequestError('No patient is booked on this slot');
  await doctorAppointmentRepository.cancelWithReason(id, reason);
  await notifyPatientDoctorCover(id, reason);
  return { id: Number(id), status: 'Cancelled' };
}

/** Declines a pending patient request: the slot becomes open again and the patient is told why. */
async function declineAppointment(user, id, body) {
  const reason = String(body?.reason ?? '').trim();
  if (!reason) throw new BadRequestError('Reason is required');
  const { doctorId, row } = await requireOwnBooking(user, id, doctorAppointmentRepository.findOwnedBookingForDecline);
  if (!isScheduled(row) || row.patientPk == null || Number(row.dc) !== 0) {
    throw new BadRequestError('Only pending patient booking requests can be declined');
  }
  await doctorAppointmentRepository.reopenDeclinedSlot(id, doctorId, reason);
  await notifyPatientDoctorDeclinedBooking({
    patientId: Number(row.patientPk),
    doctorLabel: row.doctorNameRaw ? `Dr. ${String(row.doctorNameRaw).trim()}` : `Doctor #${doctorId}`,
    dateVi: row.dateVi || '',
    timeVi: row.timeVi || '',
    department: row.depName || '',
    reason,
  });
  return { id: Number(id), status: 'Open' };
}

/** Accepts a pending patient request (no-op when already accepted) and tells the patient. */
async function confirmAppointment(user, id) {
  const { row } = await requireOwnBooking(user, id);
  if (!isScheduled(row) || row.patientPk == null) throw new BadRequestError('Nothing to confirm on this slot');
  if (Number(row.dc) === 0) {
    await doctorAppointmentRepository.markDoctorConfirmed(id);
    await notifyPatientDoctorAcceptedBooking(id);
  }
  return { id: Number(id), status: 'Pending', doctorConfirmed: true };
}

module.exports = {
  listAppointments,
  createAppointment,
  coverAppointment,
  cancelAppointment,
  declineAppointment,
  confirmAppointment,
};
