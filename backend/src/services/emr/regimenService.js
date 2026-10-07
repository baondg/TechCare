const regimenRepository = require('../../repositories/regimenRepository');
const medicalRecordRepository = require('../../repositories/medicalRecordRepository');
const nurseCheckInRepository = require('../../repositories/nurseCheckInRepository');
const orderRepository = require('../../repositories/orderRepository');
const { inTransaction } = require('../../common/transaction');
const { parseOpRouteNumeric } = require('../../common/resolvePatientRouteId');
const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolveCanonicalPatientIdFromEmrParam, resolvePatientPkFromRouteParam } = require('./patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient } = require('./staffIdentity');
const { createTreatmentForPatient, ensureDisease } = require('./treatmentService');

/** `{ id, name }` from a `{ roomId, roomName }` row, or null when it has no usable room id. */
function toRoom(row) {
  if (row?.roomId == null || !Number.isFinite(Number(row.roomId))) return null;
  return { id: Number(row.roomId), name: String(row.roomName || `Room #${row.roomId}`).trim() || `Room #${row.roomId}` };
}

/**
 * Room the patient was checked in to for the open visit: the appointment linked to the visit, else
 * the scheduled appointment that best matches the visit start (closest within −3/+2 days, same day,
 * today, closest within −5/+2 days, ±36 h), else the first treatment room of the open visit.
 * The fallbacks cover timezone vs CURDATE drift and legacy rows without APPOINTMENT.regimen_id.
 */
async function findCheckInRoom(patientRef, pid, openRegimen) {
  const regimenId = openRegimen ? Number(openRegimen.regimenId) : null;
  const regimenStart = openRegimen?.startAt != null ? openRegimen.startAt : null;
  const attempts = [];
  if (regimenId) {
    attempts.push(() => regimenRepository.findRoomOfLinkedAppointment(patientRef, regimenId));
    attempts.push(() => regimenRepository.findRoomOfAppointmentClosestToVisit(patientRef, regimenId));
  }
  if (regimenStart) attempts.push(() => regimenRepository.findRoomOfAppointmentOnDate(patientRef, regimenStart));
  attempts.push(() => regimenRepository.findRoomOfAppointmentToday(patientRef));
  if (regimenStart) {
    attempts.push(() => regimenRepository.findRoomOfAppointmentNear(patientRef, regimenStart));
    attempts.push(() => regimenRepository.findRoomOfAppointmentWithin36h(patientRef, regimenStart));
  }
  for (const attempt of attempts) {
    const room = toRoom(await attempt());
    if (room) return room;
  }
  if (!openRegimen) return null;
  const treatmentRoom = await regimenRepository.findRoomOfFirstTreatmentInOpenVisit(pid);
  return treatmentRoom?.roomId != null ? { id: Number(treatmentRoom.roomId), name: String(treatmentRoom.roomName || '') } : null;
}

/**
 * The patient's open visit (`active`, null when none) and the room they were checked in to.
 * An OP / numeric id that matches no PATIENT row is used as the patient id as is.
 */
async function getActiveRegimen(patientIdParam) {
  const pid = await resolveCanonicalPatientIdFromEmrParam(patientIdParam);
  if (!pid) throw new BadRequestError('Invalid patient');
  const open = await regimenRepository.findLatestOpenRegimen(pid);
  const checkInRoom = await findCheckInRoom(parseOpRouteNumeric(patientIdParam), pid, open);
  return {
    active: open ? { regimenId: Number(open.regimenId), startAt: open.startAt } : null,
    checkInRoom,
  };
}

/**
 * Doctor finishes the examination: ends every open visit, completes their scheduled appointments
 * and unlinks them. Medication reminders then come from the scheduler (active prescriptions).
 */
async function closeOpenRegimens(patientIdParam) {
  const pid = await resolveCanonicalPatientIdFromEmrParam(patientIdParam);
  if (!pid) throw new BadRequestError('Invalid patient');
  const open = await regimenRepository.listOpenRegimens(pid);
  if (!open.length) {
    throw new NotFoundError('No open visit to close. Check-in may not have been completed for this patient.');
  }
  const closedRegimenIds = open.map((r) => Number(r.regimenId)).filter((id) => Number.isFinite(id) && id > 0);
  await regimenRepository.closeOpenRegimens(pid);
  await nurseCheckInRepository.completeAppointmentsForClosedRegimens(pid, closedRegimenIds);
  await nurseCheckInRepository.clearAppointmentRegimenLinksForRegimenIds(pid, closedRegimenIds);
  return { regimenId: closedRegimenIds[0], closedRegimenIds, closedCount: closedRegimenIds.length };
}

/** Patient pk + their open visit; 404 / 400 otherwise. */
async function requirePatientWithOpenVisit(patientIdParam) {
  const patientPk = await resolvePatientPkFromRouteParam(patientIdParam, null);
  if (!patientPk) throw new NotFoundError('Patient not found');
  const open = await regimenRepository.findLatestOpenRegimen(patientPk);
  if (!open) throw new BadRequestError('No active regimen found for this patient');
  return { patientPk, regimenId: Number(open.regimenId) };
}

/**
 * Stores a slip as its own TREATMENT + ORDER + PROCEDURE_ (`type`, JSON in note) in the open visit.
 * @returns {Promise<number>} the ORDER id
 */
async function saveSlip({ patientPk, user, complaint, encounterType, procedureType, note, missingOrderMessage }) {
  return inTransaction(async (transaction) => {
    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint,
      encounterType,
      diseaseId,
      transaction,
    });
    const orderId = await orderRepository.insertActiveOrder(treatmentId, transaction);
    if (orderId == null) throw new AppError(missingOrderMessage, 500, { expose: true });
    await orderRepository.insertProcedure(
      { orderId, note, technicianId: null, doctorId, type: procedureType },
      transaction
    );
    return orderId;
  });
}

/** A MEDICAL_RECORD row as a line of the tracking slip. */
function toTrackingRow(row) {
  return {
    id: Number(row.id),
    updatedAt: row.time,
    bloodPressure: row.blood_pressure || '',
    pulse: Number(row.heart_rate) || 0,
    temperature: Number(row.temperature) || 0,
    weight: Number(row.weight) || 0,
    respiratoryRate: Number(row.respiratory_rate) || 0,
    spo2: Number(row.spo2) || 0,
    symptoms: row.condition || '',
  };
}

const trimmedText = (value) => (value != null ? String(value).trim() : '');

/**
 * "Phiếu theo dõi sức khoẻ": snapshots the chosen vital-sign records into the open visit.
 * Body: `{ recordIds, ms?, admissionNo?, note? }`.
 */
async function createHealthTrackingSlip(patientIdParam, user, body) {
  const { patientPk, regimenId } = await requirePatientWithOpenVisit(patientIdParam);
  const rawIds = Array.isArray(body?.recordIds) ? body.recordIds : [];
  const recordIds = [...new Set(rawIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!recordIds.length) throw new BadRequestError('recordIds is required');
  const records = await medicalRecordRepository.listVitalsByIds(patientPk, recordIds);
  if (!records.length) throw new BadRequestError('No matching health records found');

  const orderId = await saveSlip({
    patientPk,
    user,
    complaint: 'Health tracking slip',
    encounterType: 'Health info',
    procedureType: 'HEALTH_TRACKING_SLIP',
    missingOrderMessage: 'Failed to create order for health tracking slip',
    note: JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      ms: trimmedText(body?.ms),
      admissionNo: trimmedText(body?.admissionNo),
      note: trimmedText(body?.note),
      recordIds: records.map((r) => Number(r.id)),
      rows: records.map(toTrackingRow),
    }),
  });
  return { orderId: Number(orderId), regimenId, rowsCount: records.length };
}

/** "Phiếu hẹn khám lại": stores the slip object (needs `patientName`) as JSON in the open visit. */
async function createFollowUpReexamSlip(patientIdParam, user, body) {
  const { patientPk, regimenId } = await requirePatientWithOpenVisit(patientIdParam);
  const slip = body?.slip;
  if (!slip || typeof slip !== 'object') throw new BadRequestError('slip object is required');
  if (!String(slip.patientName || '').trim()) throw new BadRequestError('slip.patientName is required');

  const orderId = await saveSlip({
    patientPk,
    user,
    complaint: 'Follow-up reexam slip',
    encounterType: 'Outpatient',
    procedureType: 'FOLLOW_UP_REEXAM_SLIP',
    missingOrderMessage: 'Failed to create order for follow-up reexam slip',
    note: JSON.stringify(slip),
  });
  return { orderId: Number(orderId), regimenId };
}

module.exports = { getActiveRegimen, closeOpenRegimens, createHealthTrackingSlip, createFollowUpReexamSlip };
