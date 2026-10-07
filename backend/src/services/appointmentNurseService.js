const sequelize = require('../common/database');
const { getClinicTimezone } = require('../common/clinicDate');
const nurseCheckInRepository = require('../repositories/nurseCheckInRepository');
const { notifyDoctorsAfterNurseReschedule } = require('./appointmentNotifications');
const { BadRequestError, ConflictError, NotFoundError } = require('../errors/AppError');

/*
 * Nurse check-in (routes require appointments.nurse.checkin; validators check patientId / ids).
 * `patientId` in requests is the route form (OP… / number), resolved to PATIENT.patient_id.
 */

function parseNursePatientId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/^OP0*/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapNurseCheckInRow(r) {
  const wallDate = r.wallDate != null ? String(r.wallDate).slice(0, 10) : '';
  const wallTimeRaw = r.wallTime != null ? String(r.wallTime).split('.')[0] : '';
  const wallTime =
    wallTimeRaw.length >= 8 ? wallTimeRaw.slice(0, 8) : wallTimeRaw.length === 5 ? `${wallTimeRaw}:00` : wallTimeRaw;
  const timeDisplay = wallTime.length >= 5 ? wallTime.slice(0, 5) : '';
  const slotTime =
    wallDate && wallTime ? `${wallDate}T${wallTime}` : r.slotTime != null ? String(r.slotTime) : '';

  return {
    id: Number(r.id),
    slotTime,
    timeDisplay,
    dateDisplay: wallDate,
    doctorId: Number(r.doctorId),
    doctorName: r.doctorName || '',
    department: r.department || '',
    roomId: r.roomId != null ? Number(r.roomId) : null,
    roomName: r.roomName || '',
    condition: r.conditionNote || '',
  };
}

async function getDefaultDiseaseIdForNurseRegimen(patientId, transaction) {
  const latest = await nurseCheckInRepository.selectLatestDiseaseForPatient(patientId, transaction);
  if (latest?.diseaseId != null) return Number(latest.diseaseId);

  const z = await nurseCheckInRepository.selectZ00Disease(transaction);
  if (z?.id != null) return Number(z.id);

  return nurseCheckInRepository.insertZ00Disease(transaction);
}

async function insertNurseVisitRegimenOpenEnd(patientId, transaction) {
  const diseaseId = await getDefaultDiseaseIdForNurseRegimen(patientId, transaction);
  return nurseCheckInRepository.insertRegimenOpenEnd(patientId, diseaseId, transaction);
}

/** Reuse an existing open visit regimen when present; otherwise create one. */
async function ensureNurseVisitRegimenOpenEnd(patientId, transaction) {
  const existing = await nurseCheckInRepository.findLatestOpenRegimenIdForPatient(patientId, transaction);
  if (existing != null) return existing;
  return insertNurseVisitRegimenOpenEnd(patientId, transaction);
}

async function resolvePatientPkForNurseCheckIn(query) {
  const hintPk = Number(query?.patientPk);
  if (Number.isFinite(hintPk) && hintPk > 0) {
    const exists = await nurseCheckInRepository.findPatientPkExists(hintPk);
    if (exists != null) return exists;
  }

  const n = parseNursePatientId(query.patientId);
  if (!n) return null;
  return nurseCheckInRepository.findNursePatientPkFromNumeric(n);
}

/** PATIENT.patient_id for the request's `patientId`; 404 when there is no such patient. */
async function requirePatientPk(patientIdParam) {
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(parseNursePatientId(patientIdParam));
  if (!patientId) throw new NotFoundError('Patient not found');
  return patientId;
}

/** The patient's bookings today (plus a hinted appointment) and today's open slots. */
async function getNurseCheckInOptions({ query }) {
  const patientId = await resolvePatientPkForNurseCheckIn(query);
  if (!patientId) throw new NotFoundError('Patient not found');

  const bookedRows = await nurseCheckInRepository.listNurseBookedTodayForPatient(patientId);
  const bookedMap = new Map();
  for (const row of bookedRows || []) {
    bookedMap.set(Number(row.id), row);
  }

  const hintApptId = Number(query?.appointmentId);
  if (Number.isFinite(hintApptId) && hintApptId > 0 && !bookedMap.has(hintApptId)) {
    const extra = await nurseCheckInRepository.findNurseBookedTodayByAppointmentId(hintApptId, patientId);
    if (extra) bookedMap.set(hintApptId, extra);
  }

  const mergedBooked = Array.from(bookedMap.values()).sort((a, b) => {
    const ta = new Date(a.slotTime).getTime();
    const tb = new Date(b.slotTime).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });

  const openRows = await nurseCheckInRepository.listNurseOpenSlotsToday();
  const today = await nurseCheckInRepository.selectCurDate();

  return {
    today,
    todayTimezone: getClinicTimezone(),
    patientBookings: mergedBooked.map(mapNurseCheckInRow),
    openSlots: (openRows || []).map(mapNurseCheckInRow),
  };
}

/**
 * Checks the patient in on their booking today (optionally moving it to `roomId`) and links it to the
 * open visit: the one already linked if still open, else the patient's open visit, else a new one.
 */
async function postNurseCheckInAccept({ body }) {
  const appointmentId = Number(body.appointmentId);
  const patientId = await requirePatientPk(body.patientId);
  const row = await nurseCheckInRepository.findNurseAcceptAppointment(appointmentId, patientId);
  if (!row) throw new NotFoundError('No matching appointment for this patient today');

  const optionalRoomIdRaw = body?.roomId;
  const optionalRoomId =
    optionalRoomIdRaw != null && optionalRoomIdRaw !== '' ? Number(optionalRoomIdRaw) : null;
  if (Number.isFinite(optionalRoomId) && optionalRoomId > 0) {
    const roomRow = await nurseCheckInRepository.findClinicRoomIdExists(optionalRoomId);
    if (!roomRow) throw new BadRequestError('Invalid clinic room');
  }

  let regimenId;
  await sequelize.transaction(async (transaction) => {
    if (Number.isFinite(optionalRoomId) && optionalRoomId > 0) {
      await nurseCheckInRepository.updateNurseAppointmentRoomToday(
        appointmentId,
        patientId,
        optionalRoomId,
        transaction
      );
    }

    const linkedRegimenId = row.regimenId != null ? Number(row.regimenId) : null;
    if (Number.isFinite(linkedRegimenId) && linkedRegimenId > 0) {
      const stillOpen = await nurseCheckInRepository.findOpenRegimenForPatient(
        linkedRegimenId,
        patientId,
        transaction
      );
      if (stillOpen) {
        regimenId = linkedRegimenId;
        return;
      }
    }

    regimenId = await ensureNurseVisitRegimenOpenEnd(patientId, transaction);
    await nurseCheckInRepository.updateAppointmentRegimenId(
      appointmentId,
      patientId,
      regimenId,
      transaction
    );
  });

  const display = (await nurseCheckInRepository.getNurseAppointmentDisplay(appointmentId)) || row;
  return { appointment: mapNurseCheckInRow(display), regimenId };
}

/** Walk-in: puts the patient on one of today's open slots and opens / reuses their visit. */
async function postNurseCheckInAssign({ body }) {
  const appointmentId = Number(body.appointmentId);
  const condition = String(body.condition || 'Nurse walk-in check-in').trim() || 'Nurse walk-in check-in';
  const patientId = await requirePatientPk(body.patientId);
  const slot = await nurseCheckInRepository.findOpenSlotForAssignToday(appointmentId);
  if (!slot) throw new BadRequestError('Slot is not available or not an open slot today');

  const regimenId = await sequelize.transaction(async (transaction) => {
    await nurseCheckInRepository.assignPatientToOpenSlot(appointmentId, patientId, condition, transaction);
    // The update only applies to a still-open slot: someone else may have taken it meanwhile.
    const check = await nurseCheckInRepository.getAppointmentPatientIdRow(appointmentId, transaction);
    if (Number(check?.patientId) !== patientId) throw new ConflictError('Could not assign patient to this slot');
    const id = await ensureNurseVisitRegimenOpenEnd(patientId, transaction);
    await nurseCheckInRepository.updateAppointmentRegimenId(appointmentId, patientId, id, transaction);
    return id;
  });

  const updated = await nurseCheckInRepository.getNurseAppointmentDisplay(appointmentId);
  return { appointment: updated ? mapNurseCheckInRow(updated) : { id: appointmentId }, regimenId };
}

/**
 * Moves the patient's booking today to one of today's open slots (condition carried over), links the
 * new slot to the open visit and tells both doctors.
 */
async function postNurseCheckInReschedule({ body }) {
  const fromAppointmentId = Number(body.fromAppointmentId);
  const toAppointmentId = Number(body.toAppointmentId);
  const patientId = await requirePatientPk(body.patientId);

  const regimenId = await sequelize.transaction(async (transaction) => {
    const fromRow = await nurseCheckInRepository.findRescheduleSourceAppointmentToday(fromAppointmentId, patientId, transaction);
    if (!fromRow) throw new NotFoundError('Current appointment not found for this patient today');
    const toRow = await nurseCheckInRepository.findRescheduleTargetOpenToday(toAppointmentId, transaction);
    if (!toRow) throw new BadRequestError('Target slot is not an open slot today');

    const carriedCondition = String(fromRow.cond || '').trim() || 'Rescheduled check-in';
    await nurseCheckInRepository.clearPatientFromSlot(fromAppointmentId, patientId, transaction);
    await nurseCheckInRepository.assignPatientToSlotReserved(toAppointmentId, patientId, carriedCondition, transaction);
    const checkTo = await nurseCheckInRepository.getAppointmentPatientIdRow(toAppointmentId, transaction);
    if (Number(checkTo?.patientId) !== patientId) throw new ConflictError('Reschedule could not be completed');

    const id = await ensureNurseVisitRegimenOpenEnd(patientId, transaction);
    await nurseCheckInRepository.updateAppointmentRegimenId(toAppointmentId, patientId, id, transaction);
    return id;
  });

  const updated = await nurseCheckInRepository.getNurseAppointmentDisplay(toAppointmentId);
  await notifyDoctorsAfterNurseReschedule({ fromAppointmentId, toAppointmentId, patientId });
  return { appointment: updated ? mapNurseCheckInRow(updated) : { id: toAppointmentId }, regimenId };
}

/**
 * Legacy / admin (no page uses it; doctors close visits on the doctor routes): ends one open visit of
 * the patient and, like the doctor's close, completes its scheduled appointments and unlinks them.
 */
async function postNurseRegimenCheckout({ body }) {
  const regimenId = Number(body.regimenId);
  const patientId = await requirePatientPk(body.patientId);
  if (!(await nurseCheckInRepository.findOpenRegimenForPatient(regimenId, patientId))) {
    throw new NotFoundError('No open visit regimen found for this patient');
  }
  await sequelize.transaction(async (transaction) => {
    // Complete first: closeRegimenEndNow also clears APPOINTMENT.regimen_id, which this matches on.
    await nurseCheckInRepository.completeAppointmentsForClosedRegimens(patientId, [regimenId], transaction);
    await nurseCheckInRepository.closeRegimenEndNow(regimenId, patientId, transaction);
  });
  return regimenId;
}

module.exports = {
  findNursePatientPkFromNumeric: nurseCheckInRepository.findNursePatientPkFromNumeric,
  getNurseCheckInOptions,
  postNurseCheckInAccept,
  postNurseCheckInAssign,
  postNurseCheckInReschedule,
  postNurseRegimenCheckout,
};
