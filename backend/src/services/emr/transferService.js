const transferRepository = require('../../repositories/transferRepository');
const orderRepository = require('../../repositories/orderRepository');
const { inTransaction } = require('../../common/transaction');
const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { notifyDepartmentDoctorsInboundClinicTransfer } = require('../appointmentNotifications');
const { resolvePatientPkFromRouteParam } = require('./patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient } = require('./staffIdentity');
const { createTreatmentForPatient, ensureDisease } = require('./treatmentService');

/** Trimmed text, or null when blank. */
const textOrNull = (value) => (value != null && String(value).trim() !== '' ? String(value).trim() : null);

/** HOSPITAL_TRANSFERENCE.form_payload: objects as JSON, non-blank text as is, else null. */
function formPayloadJson(formPayload) {
  if (formPayload != null && typeof formPayload === 'object') return JSON.stringify(formPayload);
  return typeof formPayload === 'string' ? textOrNull(formPayload) : null;
}

/** Validated body: `{ kind: 'clinic', fromRoomId, toRoomId }` or `{ kind: 'hospital', toHospitalName }`, plus reason / note. */
function parseTransferBody(body) {
  const { kind, reason, note, fromRoomId, toRoomId, toHospitalId, toHospitalName, transport, formPayload } = body || {};
  const k = String(kind || '').toLowerCase();
  if (!reason || !String(reason).trim()) throw new BadRequestError('Transfer reason is required');
  if (k !== 'clinic' && k !== 'hospital') throw new BadRequestError('kind must be "clinic" or "hospital"');
  const common = { kind: k, reason: String(reason).trim(), note: textOrNull(note) };

  if (k === 'clinic') {
    const from = Number(fromRoomId);
    const to = Number(toRoomId);
    if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to) || to <= 0) {
      throw new BadRequestError('fromRoomId and toRoomId are required for clinic transfer');
    }
    if (from === to) throw new BadRequestError('From and to room must differ');
    return { ...common, fromRoomId: from, toRoomId: to };
  }

  const name = String(toHospitalName || '').trim();
  if (!name) throw new BadRequestError('toHospitalName is required for hospital transfer');
  return {
    ...common,
    toHospitalId: textOrNull(toHospitalId),
    toHospitalName: name,
    transport: textOrNull(transport),
    formPayload: formPayloadJson(formPayload),
  };
}

/**
 * Transfer document: TREATMENT ('Clinic transfer' / 'Hospital transfer', disease Z75.1) + ORDER +
 * TRANSFERENCE + CLINIC_TRANSFERENCE or HOSPITAL_TRANSFERENCE. A clinic transfer files the treatment
 * under the destination room (and its department) and notifies that department's doctors.
 */
async function createPatientTransfer(patientIdParam, user, body) {
  const patientPk = await resolvePatientPkFromRouteParam(patientIdParam, null);
  if (!patientPk) throw new NotFoundError('Patient not found');
  const transfer = parseTransferBody(body);
  const isClinic = transfer.kind === 'clinic';

  const { orderId, treatmentId } = await inTransaction(async (transaction) => {
    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const destDeptId = isClinic ? await transferRepository.findClinicRoomDepartmentId(transfer.toRoomId, transaction) : null;

    const diseaseId = await ensureDisease('Z75.1', 'Patient transfer', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: transfer.reason,
      encounterType: isClinic ? 'Clinic transfer' : 'Hospital transfer',
      deptId: destDeptId,
      roomId: isClinic ? transfer.toRoomId : null,
      diseaseId,
      transaction,
    });
    const orderId = await orderRepository.insertActiveOrder(treatmentId, transaction);
    if (orderId == null) throw new AppError('Failed to create transfer order', 500, { expose: true });

    await transferRepository.insertTransference({ orderId, reason: transfer.reason, note: transfer.note }, transaction);
    if (isClinic) {
      await transferRepository.insertClinicTransference(
        { orderId, fromRoomId: transfer.fromRoomId, toRoomId: transfer.toRoomId },
        transaction
      );
    } else {
      await transferRepository.insertHospitalTransference(
        {
          orderId,
          toId: transfer.toHospitalId,
          toName: transfer.toHospitalName,
          transport: transfer.transport,
          formPayload: transfer.formPayload,
        },
        transaction
      );
    }
    return { orderId, treatmentId };
  });

  if (isClinic) {
    await notifyDepartmentDoctorsInboundClinicTransfer({
      toRoomId: transfer.toRoomId,
      patientPk,
      reason: transfer.reason,
      note: transfer.note || '',
    });
  }
  return { orderId, treatmentId, kind: transfer.kind };
}

module.exports = { createPatientTransfer };
