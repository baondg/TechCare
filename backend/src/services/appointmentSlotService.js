const appointmentRepository = require('../repositories/appointmentRepository');
const { BadRequestError, ConflictError, NotFoundError } = require('../errors/AppError');
const {
  notifyPatientAppointmentDoctorReassigned,
  notifyPatientAppointmentMoved,
  notifyDoctorReceivedCoverAppointment,
} = require('./appointmentNotifications');

/**
 * Slots = APPOINTMENT rows managed by nurses / admins (open = no patient). Roles and request shape
 * are checked by the routes (capabilities + validators).
 */

/** Booked (time, doctor) pairs of a day. */
async function getBookedSlots({ date }) {
  return appointmentRepository.listBookedSlotsForDate(date);
}

/** Slots in an optional date range; patients only see what they may book. */
async function getOpenSlots({ role, query }) {
  const isPatientView = String(role || '').toLowerCase() === 'patient';

  const startDate = String(query?.startDate || '').trim();
  const endDate = String(query?.endDate || '').trim();
  const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const hasEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

  const rows = await appointmentRepository.listOpenSlotsInRange({
    hasStart,
    hasEnd,
    startDate: hasStart ? startDate : null,
    endDate: hasEnd ? endDate : null,
    isPatientView,
  });

  const slots = (rows || []).map((r) => ({
    id: Number(r.id),
    date: r.date,
    time: String(r.time || '').slice(0, 5),
    doctorId: Number(r.doctorId),
    doctorName: r.doctorName || '',
    department: r.department || '',
    roomId: r.roomId != null ? Number(r.roomId) : null,
    roomName: r.roomName || '',
    patientId: r.patientId != null ? Number(r.patientId) : null,
    patientUserId: r.patientUserId != null ? Number(r.patientUserId) : null,
    patientName: r.patientName || '',
    status: r.dbStatus === 'cancelled' ? 'cancelled' : r.patientId ? 'booked' : 'open',
  }));

  return slots;
}

/**
 * New open slot. Room: `roomId` (must be in the department when one is given), else a room of the
 * department (the doctor's own first), else the doctor's room, else any clinic room.
 */
async function createOpenSlot({ body }) {
  const doctorId = Number(body?.doctorId);
  const roomId = Number(body?.roomId);
  const date = String(body?.date || '').trim();
  const time = String(body?.time || '').trim().slice(0, 5);
  const condition = String(body?.condition || 'Open slot').trim();

  const dateTime = `${date} ${time}:00`;
  const departmentName = String(body?.department || '').trim();
  const departmentIdRaw = Number(body?.departmentId);

  let targetDepartmentId = null;
  if (Number.isFinite(departmentIdRaw) && departmentIdRaw > 0) {
    targetDepartmentId = await appointmentRepository.findDepartmentIdByPk(departmentIdRaw);
    if (!targetDepartmentId) throw new BadRequestError(`Unknown department id: ${departmentIdRaw}`);
  } else if (departmentName) {
    targetDepartmentId = await appointmentRepository.findDepartmentIdByName(departmentName);
    if (!targetDepartmentId) throw new BadRequestError(`Unknown department: ${departmentName}`);
  }

  let resolvedRoomId = Number.isFinite(roomId) ? roomId : null;

  if (resolvedRoomId && targetDepartmentId) {
    const roomDeptId = await appointmentRepository.findClinicRoomDepartmentId(resolvedRoomId);
    if (roomDeptId !== targetDepartmentId) {
      throw new BadRequestError('Selected room does not belong to the chosen department');
    }
  }

  if (!resolvedRoomId && targetDepartmentId) {
    resolvedRoomId = await appointmentRepository.findClinicRoomIdInDepartment(targetDepartmentId, doctorId);
    if (!resolvedRoomId) throw new BadRequestError(`No clinic room in ${departmentName || `department #${targetDepartmentId}`}`);
  }

  if (!resolvedRoomId) {
    resolvedRoomId = await appointmentRepository.findDoctorPrimaryRoomId(doctorId);
  }
  if (!resolvedRoomId) {
    resolvedRoomId = await appointmentRepository.findAnyClinicRoomId(null);
  }
  if (!resolvedRoomId) throw new BadRequestError('No clinic room available');

  const existing = await appointmentRepository.findAppointmentAtDoctorRoomTime(doctorId, resolvedRoomId, dateTime);
  if (existing?.id) throw new ConflictError('This slot already exists');

  const id = await appointmentRepository.insertOpenSlotRow({
    time: dateTime,
    condition,
    doctorId,
    roomId: resolvedRoomId,
  });

  return { id, doctorId, roomId: resolvedRoomId, date, time, status: 'open' };
}

/**
 * Moves a slot (date / time / room) and may hand it to another doctor; a booked slot only to a doctor
 * sharing a department, and then the patient and the new doctor are notified. A booked slot moved in
 * time or room with the same doctor: the patient is notified. Returns `{ id, date, time }`.
 */
async function updateOpenSlot({ id: idRaw, body }) {
  const id = Number(idRaw);
  const dateIn = String(body?.date || '').trim();
  const timeIn = String(body?.time || '').trim().slice(0, 5);
  const roomIdRaw = body?.roomId;
  const hasRoomId = roomIdRaw !== undefined && roomIdRaw !== null && String(roomIdRaw).trim() !== '';
  const parsedRoomId = Number(roomIdRaw);
  const roomId = hasRoomId && Number.isFinite(parsedRoomId) ? parsedRoomId : null;
  const doctorIdIn = body?.doctorId != null ? Number(body.doctorId) : null;

  const slot = await appointmentRepository.getSlotByIdForNurseUpdate(id);
  if (!slot) throw new NotFoundError('Slot not found');
  if (String(slot.status || '').toLowerCase() === 'cancelled') throw new BadRequestError('Slot is cancelled');

  const wall = String(slot.slotTime || '');
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(wall.replace('T', ' '));
  const existingDate = m ? m[1] : '';
  const existingTime = m ? `${m[2]}:${m[3]}` : '';
  const date = dateIn || existingDate;
  const time = timeIn || existingTime;
  if (!date || !time) throw new BadRequestError('date and time are required (or slot has invalid time)');

  let nextDoctorId = Number(slot.doctorId);
  if (Number.isFinite(doctorIdIn) && doctorIdIn > 0) {
    nextDoctorId = doctorIdIn;
  }

  let nextRoomId = slot.roomId != null ? Number(slot.roomId) : null;
  if (roomId !== null) nextRoomId = roomId;
  const newDr = await appointmentRepository.findDoctorDefaultRoomRow(nextDoctorId);
  if (nextDoctorId !== Number(slot.doctorId) && newDr?.roomId != null) {
    nextRoomId = Number(newDr.roomId);
  }

  const dateTime = `${date} ${time}:00`;
  const oldDoctorId = Number(slot.doctorId);
  const hadPatient = slot.patientId != null;

  if (hadPatient && nextDoctorId !== oldDoctorId) {
    const okDept = await appointmentRepository.doctorsShareDepartment(oldDoctorId, nextDoctorId, null);
    if (!okDept) throw new BadRequestError('Covering doctor must share a department with the current doctor');
  }

  const conflict = await appointmentRepository.findDoctorScheduledConflictExcluding(nextDoctorId, dateTime, id);
  if (conflict?.id) throw new ConflictError('That doctor already has a slot at this time');

  let oldDoctorLabel = '';
  if (nextDoctorId !== oldDoctorId) {
    const od = await appointmentRepository.getDoctorDisplayNameRow(oldDoctorId);
    oldDoctorLabel = od?.name ? `Dr. ${String(od.name).trim()}` : `Doctor #${oldDoctorId}`;
  }

  await appointmentRepository.updateSlotTimeDoctorRoom(id, dateTime, nextDoctorId, nextRoomId);

  if (hadPatient && nextDoctorId !== oldDoctorId) {
    const nd = await appointmentRepository.getDoctorDisplayNameRow(nextDoctorId);
    const newDoctorLabel = nd?.name ? `Dr. ${String(nd.name).trim()}` : `Doctor #${nextDoctorId}`;
    const depRow = await appointmentRepository.getDepartmentNameForAppointmentById(id);
    const dateVi = date.split('-').reverse().join('/');
    const timeVi = time;
    await notifyPatientAppointmentDoctorReassigned({
      patientId: Number(slot.patientId),
      dateVi,
      timeVi,
      department: depRow?.depName || '',
      oldDoctorName: oldDoctorLabel,
      newDoctorName: newDoctorLabel,
    });
  }

  const oldRoomId = slot.roomId != null ? Number(slot.roomId) : null;
  const moved = date !== existingDate || time !== existingTime || nextRoomId !== oldRoomId;
  if (hadPatient && nextDoctorId === oldDoctorId && moved) {
    await notifyPatientAppointmentMoved({
      appointmentId: id,
      previousDateVi: existingDate.split('-').reverse().join('/'),
      previousTimeVi: existingTime,
    });
  }

  if (nextDoctorId !== oldDoctorId) {
    await notifyDoctorReceivedCoverAppointment({
      appointmentId: id,
      previousDoctorLabel: oldDoctorLabel,
    });
  }

  return { id, date, time };
}

/** Cancels an open (unbooked) slot; returns its id. */
async function deleteOpenSlot({ id: idRaw }) {
  const id = Number(idRaw);
  const slot = await appointmentRepository.getSlotIdAndPatientForDelete(id);
  if (!slot) throw new NotFoundError('Slot not found');
  if (slot.patientId) throw new BadRequestError('Booked slot cannot be deleted');
  await appointmentRepository.cancelOpenSlotById(id);
  return id;
}

module.exports = {
  getBookedSlots,
  getOpenSlots,
  createOpenSlot,
  updateOpenSlot,
  deleteOpenSlot,
};
