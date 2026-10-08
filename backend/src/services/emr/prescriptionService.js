const prescriptionRepository = require('../../repositories/prescriptionRepository');
const catalogRepository = require('../../repositories/catalogRepository');
const orderRepository = require('../../repositories/orderRepository');
const { inTransaction } = require('../../common/transaction');
const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolvePatientPkFromOpRoute } = require('./patientRouteResolver');
const {
  BYT_FACILITY_ADDRESS,
  BYT_FACILITY_CODE,
  BYT_FACILITY_NAME,
  BYT_FACILITY_PHONE,
  BYT_PRESCRIPTION_TYPE,
  buildPrescriptionMetaNote,
  bytFieldsForDisplay,
  generateUniqueBytPrescriptionCode,
  isBytCodeShape,
  normalizeBytPrescriptionType,
  parsePrescriptionMetaNote,
  resolveBytDefaultsForPatient,
} = require('./bytPrescription');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, resolveDoctorDisplayName } = require('./staffIdentity');
const { createTreatmentForPatient, ensureDisease } = require('./treatmentService');

/** Days; header and lines default to 7 when missing or below 1. */
function normalizeDuration(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 7;
  return n;
}

const PRESCRIPTION_DETAIL_UNITS = new Set([
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'drop',
  'cream',
  'ointment',
  'powder',
  'spray',
]);

/** PRESCRIPTION_DETAIL.unit enum value for free text (English or Vietnamese), default 'tablet'. */
function normalizePrescriptionDetailUnit(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (PRESCRIPTION_DETAIL_UNITS.has(s)) return s;
  if (s.includes('cap')) return 'capsule';
  if (s.includes('tab') || s === 'viên') return 'tablet';
  if (s.includes('syrup') || s.includes('siro')) return 'syrup';
  if (s.includes('inj') || s.includes('inject') || s.includes('tiêm')) return 'injection';
  if (s.includes('drop') || s.includes('nhỏ')) return 'drop';
  if (s.includes('cream') || s.includes('kem')) return 'cream';
  if (s.includes('oint') || s.includes('mỡ')) return 'ointment';
  if (s.includes('powder') || s.includes('bột')) return 'powder';
  if (s.includes('spray') || s.includes('xịt')) return 'spray';
  return 'tablet';
}

function clampPrescriptionUsage(raw) {
  const t = String(raw || '').trim() || 'Take as directed';
  return t.length > 100 ? t.slice(0, 100) : t;
}

function clampPrescriptionNote(raw) {
  if (raw == null || raw === '') return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.length > 150 ? t.slice(0, 150) : t;
}

function requireMedications(medications) {
  if (!medications || !Array.isArray(medications) || medications.length === 0) {
    throw new BadRequestError('At least one medication is required');
  }
}

/** The patient's prescriptions with their lines, newest first. */
async function listPrescriptions(patientIdParam, user) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  const rows = await prescriptionRepository.listPrescriptionRowsForPatient(patientPk);

  const byOrder = new Map();
  for (const row of rows) {
    const key = row.order_id;
    if (!byOrder.has(key)) {
      const meta = parsePrescriptionMetaNote(row.prescriptionNote);
      byOrder.set(key, {
        id: key,
        patientId: patientPk,
        doctorId: row.doctorUserId || user.userId,
        doctorName: row.doctorName || '',
        department: meta.department || 'General',
        duration: Number(row.prescriptionDuration) || 7,
        /** No MEDICAL_PRESCRIPTION.status column — saved Rx is final (UI treats as signed). */
        signatureStatus: 'signed',
        byt: bytFieldsForDisplay(meta.byt),
        medications: [],
        createdAt: row.time,
        updatedAt: row.updatedAt || row.time,
      });
    }
    if (row.name) {
      byOrder.get(key).medications.push({
        id: `${key}-${row.medNo}`,
        name: row.name,
        quantity: String(row.quantity ?? ''),
        duration: String(row.lineDuration != null ? row.lineDuration : 7),
        usage: row.usage || '',
        unit: row.unit || 'tablet',
        note: row.medNote || '',
      });
    }
  }
  return Array.from(byOrder.values());
}

/**
 * Inserts PRESCRIPTION_DETAIL lines 1..n for the named medications (blank names are skipped; names
 * not in the catalog become new MEDICINE rows) and returns them as the API shows them.
 */
async function savePrescriptionLines(orderId, medications, transaction) {
  let no = 1;
  const meds = [];
  for (const med of medications) {
    const medName = String(med.name || '').trim().slice(0, 200);
    if (!medName) continue;
    const lineDuration = normalizeDuration(med.duration);
    const medicineId =
      (await catalogRepository.findMedicineIdByName(medName, transaction)) ||
      (await catalogRepository.insertMedicine(medName, transaction));
    if (!medicineId) throw new AppError('Failed to resolve medicine id', 500, { expose: true });
    const unit = normalizePrescriptionDetailUnit(med.unit);
    const usage = clampPrescriptionUsage(med.usage);
    const note = clampPrescriptionNote(med.note);
    const quantity = Number(med.quantity) || 1;
    await prescriptionRepository.insertPrescriptionLine(
      { prescriptionId: orderId, no, medicineId, quantity, duration: lineDuration, usage, unit, note },
      transaction
    );
    meds.push({
      id: `${orderId}-${no}`,
      name: medName,
      quantity: String(quantity),
      duration: String(lineDuration),
      usage,
      unit,
      note: note || '',
    });
    no += 1;
  }
  if (meds.length === 0) throw new BadRequestError('At least one medication with a name is required');
  return meds;
}

/** Whole months since `dob`, or null when unknown. */
function ageInMonths(dobValue) {
  const dob = dobValue ? new Date(dobValue) : null;
  if (!dob || Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth()));
}

/**
 * New prescription: its own TREATMENT ('Prescription') + ORDER, a header whose note carries a fresh
 * BYT code and header fields, and the lines. Children under 72 months need weight + contact phone.
 * Body: `{ medications, department?, duration?, byt? }`.
 */
async function createPrescription(patientIdParam, user, body) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  const { department, medications, duration: bodyDuration, byt: bodyBytRaw } = body;
  requireMedications(medications);
  const headerDuration = normalizeDuration(bodyDuration);
  const bodyByt = bodyBytRaw && typeof bodyBytRaw === 'object' ? bodyBytRaw : {};

  const created = await inTransaction(async (transaction) => {
    const patientDemo = await prescriptionRepository.findPatientDemographics(patientPk, transaction);
    const ageMonths = ageInMonths(patientDemo?.dob);
    const code = await generateUniqueBytPrescriptionCode({
      facilityCode: BYT_FACILITY_CODE,
      type: BYT_PRESCRIPTION_TYPE,
      transaction,
    });
    const bytDefaults = await resolveBytDefaultsForPatient(patientPk, bodyByt, patientDemo, ageMonths, transaction);
    const bytMeta = {
      code,
      prescriptionType: BYT_PRESCRIPTION_TYPE,
      facilityCode: BYT_FACILITY_CODE,
      facilityName: String(bodyByt.facilityName || BYT_FACILITY_NAME).trim() || BYT_FACILITY_NAME,
      facilityAddress: String(bodyByt.facilityAddress || BYT_FACILITY_ADDRESS).trim() || BYT_FACILITY_ADDRESS,
      ...bytDefaults,
      patientIdCard: String(patientDemo?.idcard || '').trim(),
      patientPhone: String(patientDemo?.tel || '').trim(),
    };
    if (ageMonths != null && ageMonths < 72) {
      if (!bytMeta.patientWeightKg) throw new BadRequestError('Patient weight is required for children under 72 months');
      if (!bytMeta.contactPhone) throw new BadRequestError('Contact phone is required for children under 72 months');
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Prescription',
      encounterType: 'Prescription',
      department,
      diseaseId,
      transaction,
    });
    const orderId = await orderRepository.insertActiveOrder(treatmentId, transaction);
    if (orderId == null) throw new AppError('Failed to create prescription order', 500, { expose: true });
    await prescriptionRepository.insertPrescription(
      { orderId, duration: headerDuration, note: buildPrescriptionMetaNote({ department: department || '', byt: bytMeta }) },
      transaction
    );
    const lines = await savePrescriptionLines(orderId, medications, transaction);
    const time = await prescriptionRepository.findPrescriptionTime(orderId, transaction);
    return { orderId, bytMeta, lines, time };
  });

  const createdAt = created.time ? new Date(created.time).toISOString() : new Date().toISOString();
  return {
    id: created.orderId,
    patientId: patientPk,
    doctorId: user.userId,
    doctorName: await resolveDoctorDisplayName(user),
    department: department || '',
    duration: headerDuration,
    signatureStatus: 'signed',
    byt: created.bytMeta,
    medications: created.lines,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * BYT fields after an edit: body, else stored meta, else defaults. The code is kept unless the body
 * sends a valid one; a prescription saved without one gets a fresh code. Facility code and the
 * patient's id card / phone are never taken from the body.
 */
async function bytMetaForUpdate(bodyByt, storedByt, transaction) {
  const stored = storedByt || {};
  const pick = (field, fallback = '') => String(bodyByt[field] || stored[field] || fallback).trim();
  const storedCode = isBytCodeShape(stored.code) ? String(stored.code) : null;
  const bodyCode = String(bodyByt.code || '').trim();
  return {
    code:
      bodyCode && isBytCodeShape(bodyByt.code)
        ? bodyCode
        : storedCode ||
          (await generateUniqueBytPrescriptionCode({
            facilityCode: BYT_FACILITY_CODE,
            type: BYT_PRESCRIPTION_TYPE,
            transaction,
          })),
    prescriptionType: normalizeBytPrescriptionType(bodyByt.prescriptionType || stored.prescriptionType || BYT_PRESCRIPTION_TYPE),
    facilityCode: String(stored.facilityCode || BYT_FACILITY_CODE),
    facilityName: pick('facilityName', BYT_FACILITY_NAME) || BYT_FACILITY_NAME,
    facilityAddress: pick('facilityAddress', BYT_FACILITY_ADDRESS) || BYT_FACILITY_ADDRESS,
    facilityPhone: pick('facilityPhone', BYT_FACILITY_PHONE) || BYT_FACILITY_PHONE,
    contactPhone: pick('contactPhone'),
    guardianName: pick('guardianName'),
    advice: pick('advice'),
    insuranceId: pick('insuranceId'),
    patientAddress: pick('patientAddress'),
    patientWeightKg: pick('patientWeightKg'),
    patientIdCard: String(stored.patientIdCard || '').trim(),
    patientPhone: String(stored.patientPhone || '').trim(),
  };
}

/**
 * Replaces the lines of an existing prescription (same ORDER / header) and merges the BYT fields.
 * The prescribing date (`time`) is kept; `updated_at` is set to now. `department` / `duration` are
 * kept when omitted.
 */
async function updatePrescription(patientIdParam, idParam, user, body) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  const orderId = Number(idParam);
  if (!patientPk || !Number.isFinite(orderId)) throw new BadRequestError('Invalid patient or prescription id');
  const { department, medications, duration: bodyDuration, byt: bodyBytRaw } = body;
  requireMedications(medications);
  const headerDuration = bodyDuration !== undefined && bodyDuration !== null ? normalizeDuration(bodyDuration) : null;
  const bodyByt = bodyBytRaw && typeof bodyBytRaw === 'object' ? bodyBytRaw : {};

  const updated = await inTransaction(async (transaction) => {
    if (!(await prescriptionRepository.prescriptionBelongsToPatient(orderId, patientPk, transaction))) {
      throw new NotFoundError('Prescription not found');
    }
    await prescriptionRepository.deletePrescriptionLines(orderId, transaction);

    const stored = parsePrescriptionMetaNote(await prescriptionRepository.findPrescriptionNote(orderId, transaction));
    const bytMeta = await bytMetaForUpdate(bodyByt, stored.byt, transaction);
    const nextDepartment = department !== undefined ? department || '' : stored.department || '';
    await prescriptionRepository.updatePrescription(
      orderId,
      {
        note: buildPrescriptionMetaNote({ department: nextDepartment, byt: bytMeta }),
        duration: headerDuration != null ? headerDuration : undefined,
      },
      transaction
    );
    const lines = await savePrescriptionLines(orderId, medications, transaction);
    const header = await prescriptionRepository.findPrescriptionTimeAndDuration(orderId, transaction);
    return { bytMeta, department: nextDepartment, lines, header };
  });

  const toIso = (value) => (value ? new Date(value).toISOString() : new Date().toISOString());
  const createdAt = toIso(updated.header?.time);
  const updatedAt = toIso(updated.header?.updatedAt);
  return {
    id: orderId,
    patientId: patientPk,
    doctorId: user.userId,
    doctorName: await resolveDoctorDisplayName(user),
    department: updated.department,
    duration: Number(updated.header?.duration) || headerDuration || 7,
    signatureStatus: 'signed',
    byt: updated.bytMeta,
    medications: updated.lines,
    createdAt,
    updatedAt,
  };
}

module.exports = { listPrescriptions, createPrescription, updatePrescription };
