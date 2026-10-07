const surgeryRepository = require('../../repositories/surgeryRepository');
const orderRepository = require('../../repositories/orderRepository');
const { inTransaction } = require('../../common/transaction');
const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolvePatientPkFromOpRoute } = require('./patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient } = require('./staffIdentity');
const { createTreatmentForPatient, ensureDisease } = require('./treatmentService');

const SURGERY_TYPES = ['Minor Surgery', 'Intermediate Surgery', 'Major Ambulatory Surgery', 'Day Surgery'];
const DEFAULT_SURGERY_TYPE = 'Day Surgery';
const URGENCIES = ['HIGH', 'MEDIUM', 'LOW'];

/** A SURGERY_TYPES value, the default for blank input, or null when not allowed. */
function normalizeSurgeryTypeInput(value) {
  const s = String(value ?? '').trim();
  if (!s) return DEFAULT_SURGERY_TYPE;
  return SURGERY_TYPES.includes(s) ? s : null;
}

function requireSurgeryType(value) {
  const type = normalizeSurgeryTypeInput(value);
  if (!type) throw new BadRequestError(`type must be one of: ${SURGERY_TYPES.join(', ')}`);
  return type;
}

/** Validated start/end and the duration in whole minutes (at least 1). */
function requireTimeRange(start, end) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new BadRequestError('Invalid start/end; end must be after start');
  }
  return { start, end, duration: Math.max(1, Math.round((end - start) / 60000)) };
}

const normalizeUrgency = (value) => {
  const u = String(value).toUpperCase();
  return URGENCIES.includes(u) ? u : 'MEDIUM';
};

/** PROCEDURE_.type is VARCHAR(100). */
const procedureType = (type) => (type.length > 100 ? type.slice(0, 100) : type);

const trimmedOrNull = (value) => (value != null && String(value).trim() ? String(value).trim() : null);

/**
 * A surgeon picked by DOCTOR id (`doctorId` in the body; ignored unless a positive number):
 * `{ id, name }` with the stored name, falling back to `typedName`. Unknown doctor → 400.
 */
async function resolveSurgeon(doctorIdInput, typedName, transaction) {
  const doctorId = Number(doctorIdInput);
  if (!Number.isFinite(doctorId) || doctorId <= 0) return null;
  const surgeon = await surgeryRepository.findSurgeon(doctorId, transaction);
  if (!surgeon) throw new BadRequestError('Invalid doctorId for surgeon');
  return { id: doctorId, name: String(surgeon.surgeonName || '').trim().slice(0, 120) || typedName };
}

async function requirePatientPk(patientIdParam) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  return patientPk;
}

/** The patient's surgeries, latest start first. */
async function listSurgeries(patientIdParam) {
  return surgeryRepository.listSurgeriesForPatient(await requirePatientPk(patientIdParam));
}

/**
 * New surgery order: TREATMENT ('Surgery') + ORDER + PROCEDURE_ (note) + SURGERY. Defaults: type
 * 'Day Surgery', start now, end one hour after start, urgency MEDIUM.
 * Body: `{ type?, start?, end?, doctorId?, surgeonName?, urgency?, result?, note? }`.
 */
async function createSurgery(patientIdParam, user, body) {
  const patientPk = await requirePatientPk(patientIdParam);
  const { type, start, end, doctorId: surgeonDoctorId, surgeonName, urgency, result, note } = body;
  const typeStr = requireSurgeryType(type);
  const startDt = start ? new Date(start) : new Date();
  const range = requireTimeRange(startDt, end ? new Date(end) : new Date(startDt.getTime() + 60 * 60 * 1000));
  const urg = normalizeUrgency(urgency || 'MEDIUM');
  const typedSurgeonName = surgeonName != null && String(surgeonName).trim() ? String(surgeonName).trim().slice(0, 120) : null;

  const { orderId, surgeon } = await inTransaction(async (transaction) => {
    const surgeon = await resolveSurgeon(surgeonDoctorId, typedSurgeonName, transaction);
    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Surgery',
      encounterType: 'Surgery',
      diseaseId,
      transaction,
    });
    const orderId = await orderRepository.insertActiveOrder(treatmentId, transaction);
    if (orderId == null) throw new AppError('Failed to create surgery order', 500, { expose: true });
    await orderRepository.insertProcedure(
      { orderId, note: note || null, technicianId: null, doctorId, type: procedureType(typeStr) },
      transaction
    );
    await surgeryRepository.insertSurgery(
      {
        id: orderId,
        duration: range.duration,
        start: range.start,
        end: range.end,
        result: trimmedOrNull(result),
        type: typeStr,
        surgeon: surgeon ? surgeon.id : null,
        urgency: urg,
      },
      transaction
    );
    return { orderId, surgeon };
  });

  return {
    id: orderId,
    patientId: patientPk,
    type: typeStr,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    surgeonName: surgeon ? surgeon.name : typedSurgeonName,
    urgency: urg,
    result: trimmedOrNull(result),
    note: trimmedOrNull(note),
  };
}

/**
 * Partial update; omitted fields keep their stored value (a stored type outside SURGERY_TYPES
 * becomes 'Day Surgery'). `surgeonName` is only echoed back. `id` is the raw route param.
 */
async function updateSurgery(patientIdParam, id, body) {
  const patientPk = await requirePatientPk(patientIdParam);
  if (!(await surgeryRepository.surgeryBelongsToPatient(id, patientPk))) throw new NotFoundError('Surgery not found');
  const { type, start, end, doctorId: surgeonDoctorId, surgeonName, urgency, result, note } = body;

  const cur = await surgeryRepository.findSurgery(id);
  if (!cur) throw new NotFoundError('Surgery not found');

  let nextType = type !== undefined ? requireSurgeryType(type) : String(cur.type || '').trim() || DEFAULT_SURGERY_TYPE;
  if (!SURGERY_TYPES.includes(nextType)) nextType = DEFAULT_SURGERY_TYPE;
  const range = requireTimeRange(
    start !== undefined ? new Date(start) : new Date(cur.start),
    end !== undefined ? new Date(end) : new Date(cur.end)
  );
  const nextUrgency = urgency !== undefined ? normalizeUrgency(urgency) : cur.urgency;
  const typedSurgeonName = surgeonName !== undefined && String(surgeonName).trim() ? String(surgeonName).trim().slice(0, 120) : null;
  const surgeon = await resolveSurgeon(surgeonDoctorId, typedSurgeonName);
  const nextResult = result !== undefined ? result : cur.result;

  // One transaction: SURGERY and its PROCEDURE_ row (type, note) change together.
  const noteFinal = await inTransaction(async (transaction) => {
    await surgeryRepository.updateSurgery(
      id,
      {
        type: nextType,
        start: range.start,
        end: range.end,
        duration: range.duration,
        urgency: nextUrgency,
        surgeon: surgeon ? surgeon.id : cur.surgeon != null ? Number(cur.surgeon) : null,
        result: nextResult,
      },
      transaction
    );
    await orderRepository.updateProcedureType(id, procedureType(nextType), transaction);
    if (note !== undefined) await orderRepository.updateProcedureNote(id, note, transaction);
    return orderRepository.findProcedureNote(id, transaction);
  });

  return {
    id: Number(id),
    patientId: patientPk,
    type: nextType,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    surgeonName: surgeon ? surgeon.name : typedSurgeonName,
    urgency: nextUrgency,
    result: nextResult,
    note: noteFinal,
  };
}

module.exports = { listSurgeries, createSurgery, updateSurgery };
