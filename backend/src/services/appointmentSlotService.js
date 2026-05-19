const appointmentRepository = require('../repositories/appointmentRepository');
const {
  notifyPatientAppointmentDoctorReassigned,
  notifyDoctorReceivedCoverAppointment,
} = require('./appointmentNotifications');

function isNurseOrAdmin(role) {
  return ['nurse', 'admin'].includes(String(role || '').toLowerCase());
}

async function getBookedSlots({ date }) {
  if (!date) {
    return { ok: false, status: 400, json: { message: 'date query param required' } };
  }
  const booked = await appointmentRepository.listBookedSlotsForDate(date);
  return { ok: true, status: 200, json: { success: true, slots: booked } };
}

async function getOpenSlots({ role, query }) {
  const roleNorm = String(role || '').toLowerCase();
  const canViewForManagement = ['nurse', 'admin'].includes(roleNorm);
  const isPatientView = roleNorm === 'patient';
  if (!canViewForManagement && !isPatientView) {
    return { ok: false, status: 403, json: { success: false, message: 'Forbidden' } };
  }

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

  return { ok: true, status: 200, json: { success: true, slots } };
}

async function createOpenSlot({ role, body }) {
  if (!isNurseOrAdmin(role)) {
    return { ok: false, status: 403, json: { success: false, message: 'Forbidden' } };
  }

  const doctorId = Number(body?.doctorId);
  const roomId = Number(body?.roomId);
  const date = String(body?.date || '').trim();
  const time = String(body?.time || '').trim().slice(0, 5);
  const condition = String(body?.condition || 'Open slot').trim();

  if (!Number.isFinite(doctorId) || !date || !time) {
    return { ok: false, status: 400, json: { success: false, message: 'doctorId, date and time are required' } };
  }

  const dateTime = `${date} ${time}:00`;
  let resolvedRoomId = Number.isFinite(roomId) ? roomId : null;
  if (!resolvedRoomId) {
    resolvedRoomId = await appointmentRepository.findDoctorPrimaryRoomId(doctorId);
  }
  if (!resolvedRoomId) {
    resolvedRoomId = await appointmentRepository.findAnyClinicRoomId(null);
  }
  if (!resolvedRoomId) {
    return { ok: false, status: 400, json: { success: false, message: 'No clinic room available' } };
  }

  const existing = await appointmentRepository.findAppointmentAtDoctorRoomTime(doctorId, resolvedRoomId, dateTime);
  if (existing?.id) {
    return { ok: false, status: 409, json: { success: false, message: 'This slot already exists' } };
  }

  const id = await appointmentRepository.insertOpenSlotRow({
    time: dateTime,
    condition,
    doctorId,
    roomId: resolvedRoomId,
  });

  return {
    ok: true,
    status: 201,
    json: { success: true, slot: { id, doctorId, roomId: resolvedRoomId, date, time, status: 'open' } },
  };
}

async function updateOpenSlot({ role, id: idRaw, body }) {
  if (!isNurseOrAdmin(role)) {
    return { ok: false, status: 403, json: { success: false, message: 'Forbidden' } };
  }

  const id = Number(idRaw);
  const dateIn = String(body?.date || '').trim();
  const timeIn = String(body?.time || '').trim().slice(0, 5);
  const roomIdRaw = body?.roomId;
  const hasRoomId = roomIdRaw !== undefined && roomIdRaw !== null && String(roomIdRaw).trim() !== '';
  const parsedRoomId = Number(roomIdRaw);
  const roomId = hasRoomId && Number.isFinite(parsedRoomId) ? parsedRoomId : null;
  const doctorIdIn = body?.doctorId != null ? Number(body.doctorId) : null;

  if (!Number.isFinite(id)) {
    return { ok: false, status: 400, json: { success: false, message: 'Invalid id' } };
  }

  const slot = await appointmentRepository.getSlotByIdForNurseUpdate(id);
  if (!slot) return { ok: false, status: 404, json: { success: false, message: 'Slot not found' } };
  if (String(slot.status || '').toLowerCase() === 'cancelled') {
    return { ok: false, status: 400, json: { success: false, message: 'Slot is cancelled' } };
  }

  const wall = String(slot.slotTime || '');
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(wall.replace('T', ' '));
  const existingDate = m ? m[1] : '';
  const existingTime = m ? `${m[2]}:${m[3]}` : '';
  const date = dateIn || existingDate;
  const time = timeIn || existingTime;
  if (!date || !time) {
    return {
      ok: false,
      status: 400,
      json: { success: false, message: 'date and time are required (or slot has invalid time)' },
    };
  }

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
    if (!okDept) {
      return {
        ok: false,
        status: 400,
        json: { success: false, message: 'Covering doctor must share a department with the current doctor' },
      };
    }
  }

  const conflict = await appointmentRepository.findDoctorScheduledConflictExcluding(nextDoctorId, dateTime, id);
  if (conflict?.id) {
    return { ok: false, status: 409, json: { success: false, message: 'That doctor already has a slot at this time' } };
  }

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

  if (nextDoctorId !== oldDoctorId) {
    await notifyDoctorReceivedCoverAppointment({
      appointmentId: id,
      previousDoctorLabel: oldDoctorLabel,
    });
  }

  return { ok: true, status: 200, json: { success: true, id, date, time } };
}

async function deleteOpenSlot({ role, id: idRaw }) {
  if (!isNurseOrAdmin(role)) {
    return { ok: false, status: 403, json: { success: false, message: 'Forbidden' } };
  }
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return { ok: false, status: 400, json: { success: false, message: 'Invalid id' } };
  }
  const slot = await appointmentRepository.getSlotIdAndPatientForDelete(id);
  if (!slot) return { ok: false, status: 404, json: { success: false, message: 'Slot not found' } };
  if (slot.patientId) {
    return { ok: false, status: 400, json: { success: false, message: 'Booked slot cannot be deleted' } };
  }
  await appointmentRepository.cancelOpenSlotById(id);
  return { ok: true, status: 200, json: { success: true, id } };
}

module.exports = {
  getBookedSlots,
  getOpenSlots,
  createOpenSlot,
  updateOpenSlot,
  deleteOpenSlot,
};
