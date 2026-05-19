const sequelize = require('../common/database');
const nurseCheckInRepository = require('../repositories/nurseCheckInRepository');
const { notifyDoctorsAfterNurseReschedule } = require('./appointmentNotifications');

function nurseOrAdminForbidden() {
  return { ok: false, status: 403, json: { success: false, message: 'Forbidden' } };
}

function ensureNurseOrAdmin(role) {
  const r = String(role || '').toLowerCase();
  if (!['nurse', 'admin'].includes(r)) return nurseOrAdminForbidden();
  return null;
}

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

async function syncPatientInDeptFromAppointmentRoom(_patientId, _appointmentId, _transaction) {
  return { synced: false };
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

async function getNurseCheckInOptions({ role, query }) {
  const denied = ensureNurseOrAdmin(role);
  if (denied) return denied;

  const n = parseNursePatientId(query.patientId);
  if (!n) {
    return { ok: false, status: 400, json: { success: false, message: 'patientId is required' } };
  }
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(n);
  if (!patientId) {
    return { ok: false, status: 404, json: { success: false, message: 'Patient not found' } };
  }

  const bookedRows = await nurseCheckInRepository.listNurseBookedTodayForPatient(patientId);
  const openRows = await nurseCheckInRepository.listNurseOpenSlotsToday();
  const today = await nurseCheckInRepository.selectCurDate();

  return {
    ok: true,
    status: 200,
    json: {
      success: true,
      today,
      patientBookings: (bookedRows || []).map(mapNurseCheckInRow),
      openSlots: (openRows || []).map(mapNurseCheckInRow),
    },
  };
}

async function postNurseCheckInAccept({ role, body }) {
  const denied = ensureNurseOrAdmin(role);
  if (denied) return denied;

  const nAccept = parseNursePatientId(body?.patientId);
  const appointmentId = Number(body?.appointmentId);
  if (!nAccept || !Number.isFinite(appointmentId)) {
    return { ok: false, status: 400, json: { success: false, message: 'patientId and appointmentId are required' } };
  }
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(nAccept);
  if (!patientId) {
    return { ok: false, status: 404, json: { success: false, message: 'Patient not found' } };
  }

  const row = await nurseCheckInRepository.findNurseAcceptAppointment(appointmentId, patientId);
  if (!row) {
    return {
      ok: false,
      status: 404,
      json: { success: false, message: 'No matching appointment for this patient today' },
    };
  }

  const optionalRoomIdRaw = body?.roomId;
  const optionalRoomId =
    optionalRoomIdRaw != null && optionalRoomIdRaw !== '' ? Number(optionalRoomIdRaw) : null;
  if (Number.isFinite(optionalRoomId) && optionalRoomId > 0) {
    const roomRow = await nurseCheckInRepository.findClinicRoomIdExists(optionalRoomId);
    if (!roomRow) {
      return { ok: false, status: 400, json: { success: false, message: 'Invalid clinic room' } };
    }
    await nurseCheckInRepository.updateNurseAppointmentRoomToday(appointmentId, patientId, optionalRoomId);
  }

  const regimenId = await insertNurseVisitRegimenOpenEnd(patientId);
  await syncPatientInDeptFromAppointmentRoom(patientId, appointmentId);
  await nurseCheckInRepository.updateAppointmentRegimenId(appointmentId, patientId, regimenId);

  return {
    ok: true,
    status: 200,
    json: { success: true, appointment: mapNurseCheckInRow(row), regimenId },
  };
}

async function postNurseCheckInAssign({ role, body }) {
  const denied = ensureNurseOrAdmin(role);
  if (denied) return denied;

  const nAssign = parseNursePatientId(body?.patientId);
  const appointmentId = Number(body?.appointmentId);
  const condition = String(body?.condition || 'Nurse walk-in check-in').trim() || 'Nurse walk-in check-in';
  if (!nAssign || !Number.isFinite(appointmentId)) {
    return { ok: false, status: 400, json: { success: false, message: 'patientId and appointmentId are required' } };
  }
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(nAssign);
  if (!patientId) {
    return { ok: false, status: 404, json: { success: false, message: 'Patient not found' } };
  }

  const slot = await nurseCheckInRepository.findOpenSlotForAssignToday(appointmentId);
  if (!slot) {
    return {
      ok: false,
      status: 400,
      json: { success: false, message: 'Slot is not available or not an open slot today' },
    };
  }

  let regimenId;
  try {
    await sequelize.transaction(async (transaction) => {
      await nurseCheckInRepository.assignPatientToOpenSlot(appointmentId, patientId, condition, transaction);
      const check = await nurseCheckInRepository.getAppointmentPatientIdRow(appointmentId, transaction);
      if (Number(check?.patientId) !== patientId) {
        throw new Error('ASSIGN_CONFLICT');
      }
      regimenId = await insertNurseVisitRegimenOpenEnd(patientId, transaction);
      await syncPatientInDeptFromAppointmentRoom(patientId, appointmentId, transaction);
      await nurseCheckInRepository.updateAppointmentRegimenId(appointmentId, patientId, regimenId, transaction);
    });
  } catch (error) {
    if (error.message === 'ASSIGN_CONFLICT') {
      return { ok: false, status: 409, json: { success: false, message: 'Could not assign patient to this slot' } };
    }
    throw error;
  }

  const updated = await nurseCheckInRepository.getNurseAppointmentDisplay(appointmentId);
  return {
    ok: true,
    status: 200,
    json: {
      success: true,
      appointment: updated ? mapNurseCheckInRow(updated) : { id: appointmentId },
      regimenId,
    },
  };
}

async function postNurseCheckInReschedule({ role, body }) {
  const denied = ensureNurseOrAdmin(role);
  if (denied) return denied;

  const nRe = parseNursePatientId(body?.patientId);
  const fromAppointmentId = Number(body?.fromAppointmentId);
  const toAppointmentId = Number(body?.toAppointmentId);
  if (!nRe || !Number.isFinite(fromAppointmentId) || !Number.isFinite(toAppointmentId)) {
    return {
      ok: false,
      status: 400,
      json: { success: false, message: 'patientId, fromAppointmentId and toAppointmentId are required' },
    };
  }
  if (fromAppointmentId === toAppointmentId) {
    return { ok: false, status: 400, json: { success: false, message: 'Cannot reschedule to the same slot' } };
  }
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(nRe);
  if (!patientId) {
    return { ok: false, status: 404, json: { success: false, message: 'Patient not found' } };
  }

  let regimenId;
  try {
    await sequelize.transaction(async (transaction) => {
      const fromRow = await nurseCheckInRepository.findRescheduleSourceAppointmentToday(
        fromAppointmentId,
        patientId,
        transaction
      );
      if (!fromRow) {
        throw new Error('SOURCE_APPT_NOT_FOUND');
      }

      const toRow = await nurseCheckInRepository.findRescheduleTargetOpenToday(toAppointmentId, transaction);
      if (!toRow) {
        throw new Error('TARGET_SLOT_NOT_OPEN');
      }

      const carriedCondition = String(fromRow.cond || '').trim() || 'Rescheduled check-in';

      await nurseCheckInRepository.clearPatientFromSlot(fromAppointmentId, patientId, transaction);
      await nurseCheckInRepository.assignPatientToSlotReserved(toAppointmentId, patientId, carriedCondition, transaction);

      const checkTo = await nurseCheckInRepository.getAppointmentPatientIdRow(toAppointmentId, transaction);
      if (Number(checkTo?.patientId) !== patientId) {
        throw new Error('RESCHEDULE_ASSIGN_FAILED');
      }

      regimenId = await insertNurseVisitRegimenOpenEnd(patientId, transaction);
      await syncPatientInDeptFromAppointmentRoom(patientId, toAppointmentId, transaction);
      await nurseCheckInRepository.updateAppointmentRegimenId(toAppointmentId, patientId, regimenId, transaction);
    });
  } catch (error) {
    if (error.message === 'SOURCE_APPT_NOT_FOUND') {
      return {
        ok: false,
        status: 404,
        json: { success: false, message: 'Current appointment not found for this patient today' },
      };
    }
    if (error.message === 'TARGET_SLOT_NOT_OPEN') {
      return {
        ok: false,
        status: 400,
        json: { success: false, message: 'Target slot is not an open slot today' },
      };
    }
    if (error.message === 'RESCHEDULE_ASSIGN_FAILED') {
      return { ok: false, status: 409, json: { success: false, message: 'Reschedule could not be completed' } };
    }
    throw error;
  }

  const updated = await nurseCheckInRepository.getNurseAppointmentDisplay(toAppointmentId);
  await notifyDoctorsAfterNurseReschedule({
    fromAppointmentId,
    toAppointmentId,
    patientId,
  });

  return {
    ok: true,
    status: 200,
    json: {
      success: true,
      appointment: updated ? mapNurseCheckInRow(updated) : { id: toAppointmentId },
      regimenId,
    },
  };
}

async function postNurseRegimenCheckout({ role, body }) {
  const denied = ensureNurseOrAdmin(role);
  if (denied) return denied;

  const nCo = parseNursePatientId(body?.patientId);
  const regimenId = Number(body?.regimenId);
  if (!nCo || !Number.isFinite(regimenId)) {
    return { ok: false, status: 400, json: { success: false, message: 'patientId and regimenId are required' } };
  }
  const patientId = await nurseCheckInRepository.findNursePatientPkFromNumeric(nCo);
  if (!patientId) {
    return { ok: false, status: 404, json: { success: false, message: 'Patient not found' } };
  }

  const active = await nurseCheckInRepository.findOpenRegimenForPatient(regimenId, patientId);
  if (!active) {
    return {
      ok: false,
      status: 404,
      json: { success: false, message: 'No open visit regimen found for this patient' },
    };
  }

  await nurseCheckInRepository.closeRegimenEndNow(regimenId, patientId);
  return { ok: true, status: 200, json: { success: true, regimenId } };
}

module.exports = {
  findNursePatientPkFromNumeric: nurseCheckInRepository.findNursePatientPkFromNumeric,
  getNurseCheckInOptions,
  postNurseCheckInAccept,
  postNurseCheckInAssign,
  postNurseCheckInReschedule,
  postNurseRegimenCheckout,
};
