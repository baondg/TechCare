const regimenRepository = require('../../repositories/regimenRepository');
const documents = require('../../repositories/regimenDocumentRepository');
const { BadRequestError } = require('../../errors/AppError');
const { resolvePatientPkFromRouteParam } = require('./patientRouteResolver');
const { bytFieldsForDisplay, parsePrescriptionMetaNote } = require('./bytPrescription');

/** A JSON column as an object: objects as is, text parsed, anything else (or broken JSON) null. */
function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function toHospitalTransfer(row) {
  return {
    orderId: Number(row.orderId),
    reason: row.reason || '',
    note: row.note || '',
    transferAt: row.transferAt,
    toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
    toHospitalName: row.toHospitalName || '',
    transport: row.transport || null,
    formPayload: parseJsonColumn(row.formPayload),
  };
}

/** Lines grouped by key (`keyOf(row)`; rows with a null key are skipped), first-seen order kept. */
function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function requirePatientPk(patientIdParam) {
  const patientPk = await resolvePatientPkFromRouteParam(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient');
  return patientPk;
}

// ─── Open visit ───

/** Prescriptions with BYT fields and lines, as the "finish examination" review shows them. */
function toReviewPrescriptions(rows) {
  const byOrder = new Map();
  for (const row of rows) {
    if (!byOrder.has(row.orderId)) {
      const meta = parsePrescriptionMetaNote(row.prescriptionNote);
      byOrder.set(row.orderId, {
        id: row.orderId,
        prescribedAt: row.prescribedAt || null,
        duration: Number(row.prescriptionDuration) || 7,
        department: meta.department || '',
        signatureStatus: 'signed',
        byt: bytFieldsForDisplay(meta.byt),
        medications: [],
      });
    }
    if (row.name) {
      byOrder.get(row.orderId).medications.push({
        id: `${row.orderId}-${row.medNo}`,
        name: row.name,
        quantity: String(row.quantity ?? ''),
        usage: row.usageText || '',
        unit: row.unit || '',
        duration: String(row.lineDuration != null ? row.lineDuration : 7),
        note: row.medNote || '',
      });
    }
  }
  return Array.from(byOrder.values());
}

function toHealthTrackingSlip(row) {
  const payload = parseJsonColumn(row.payload);
  const lines = Array.isArray(payload?.rows) ? payload.rows : [];
  return {
    orderId: Number(row.orderId),
    createdAt: row.createdAt,
    createdByDoctor: row.createdByDoctor || null,
    rows: lines.map((r) => ({
      id: Number(r?.id) || 0,
      updatedAt: r?.updatedAt || r?.time || row.createdAt,
      bloodPressure: r?.bloodPressure || '',
      pulse: Number(r?.pulse) || 0,
      temperature: Number(r?.temperature) || 0,
      weight: Number(r?.weight) || 0,
      respiratoryRate: Number(r?.respiratoryRate) || 0,
      spo2: Number(r?.spo2) || 0,
      symptoms: r?.symptoms || '',
    })),
    formPayload: payload,
  };
}

/**
 * Every document of the patient's open visit(s), for the "finish examination" review; null when
 * there is no open visit. `regimenId` / `regimenStart` are those of the latest one.
 */
async function getOpenRegimenDocuments(patientIdParam) {
  const patientPk = await requirePatientPk(patientIdParam);
  const openRows = await regimenRepository.listOpenRegimens(patientPk);
  const [latest] = openRows;
  if (!latest) return null;
  const regimenIds = [...new Set(openRows.map((r) => Number(r.regimenId)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!regimenIds.length) return null;

  const [treatments, diagnoses, rxRows, labTests, surgeries, transferRows, trackingRows, reexamRows] = await Promise.all([
    documents.listTreatments(patientPk, regimenIds),
    documents.listDiagnoses(patientPk, regimenIds),
    documents.listPrescriptionRows(patientPk, regimenIds),
    documents.listLabTests(patientPk, regimenIds),
    documents.listSurgeries(patientPk, regimenIds),
    documents.listHospitalTransfers(regimenIds),
    documents.listHealthTrackingSlips(regimenIds),
    documents.listFollowUpReexamSlips(regimenIds),
  ]);

  return {
    regimenId: Number(latest.regimenId),
    regimenStart: latest.regimenStart,
    treatments: treatments.map(({ regimenId: _regimenId, ...treatment }) => treatment),
    diagnoses,
    prescriptions: toReviewPrescriptions(rxRows),
    labTests,
    surgeries,
    hospitalTransfers: transferRows.map(toHospitalTransfer),
    healthTrackingSlips: trackingRows.map(toHealthTrackingSlip),
    followUpReexamSlips: reexamRows
      .map((row) => ({ orderId: Number(row.orderId), createdAt: row.createdAt, slip: parseJsonColumn(row.payload) }))
      .filter((x) => x.orderId > 0 && x.slip && typeof x.slip === 'object'),
  };
}

// ─── Completed visits ───

/** treatmentId → its prescriptions (`{ id, prescribedAt, signatureStatus, medications }`). */
function historyPrescriptionsByTreatment(rows) {
  const byTreatment = new Map();
  for (const [treatmentId, lines] of groupBy(rows, (r) => r.treatmentId)) {
    const byOrder = new Map();
    for (const row of lines) {
      if (!byOrder.has(row.orderId)) {
        byOrder.set(row.orderId, { id: row.orderId, prescribedAt: row.prescribedAt, signatureStatus: 'signed', medications: [] });
      }
      if (row.name) {
        byOrder.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.usageText || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }
    byTreatment.set(treatmentId, Array.from(byOrder.values()));
  }
  return byTreatment;
}

/** Items of all the visit's treatments, deduplicated by `id` (first one wins when `keepFirst`). */
function collectForTreatments(treatments, itemsByTreatment, { keepFirst = false } = {}) {
  const byId = new Map();
  for (const t of treatments) {
    for (const item of itemsByTreatment.get(t.treatmentId) || []) {
      if (!keepFirst || !byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

/**
 * The patient's completed visits, latest first, each summarised from its treatments (complaints,
 * doctors, first treatment's department / room / diagnosis) with its prescriptions, lab tests,
 * surgeries and hospital transfers.
 */
async function listCompletedRegimens(patientIdParam) {
  const patientPk = await requirePatientPk(patientIdParam);
  const regimenRows = await regimenRepository.listCompletedRegimens(patientPk);
  if (!regimenRows.length) return [];
  const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));

  const transfersByRegimen = groupBy(await documents.listHospitalTransfers(regimenIds), (row) =>
    Number.isFinite(Number(row.regimenId)) ? Number(row.regimenId) : null
  );
  const [treatments, rxRows, labRows, surgeryRows] = await Promise.all([
    documents.listTreatments(patientPk, regimenIds),
    documents.listPrescriptionRows(patientPk, regimenIds),
    documents.listLabTests(patientPk, regimenIds),
    documents.listSurgeries(patientPk, regimenIds),
  ]);

  const prescriptionsByTreatment = historyPrescriptionsByTreatment(rxRows);
  const labsByTreatment = new Map(
    [...groupBy(labRows, (r) => r.treatmentId)].map(([tid, rows]) => [
      tid,
      rows.map((row) => ({
        id: row.id,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      })),
    ])
  );
  const surgeriesByTreatment = new Map(
    [...groupBy(surgeryRows, (r) => r.treatmentId)].map(([tid, rows]) => [
      tid,
      rows.map((row) => ({
        id: row.id,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      })),
    ])
  );
  const treatmentsByRegimen = groupBy(treatments, (t) => (Number.isFinite(Number(t.regimenId)) ? Number(t.regimenId) : null));

  return regimenRows.map((reg) => {
    const rid = Number(reg.regimenId);
    const tlist = treatmentsByRegimen.get(rid) || [];
    const primary = tlist[0] || null;
    const complaints = tlist.map((x) => x.complaint).filter((c) => c && String(c).trim());
    const doctors = [...new Set(tlist.map((x) => x.doctorName).filter(Boolean))];
    return {
      regimenId: rid,
      treatmentId: primary ? primary.treatmentId : 0,
      visitAt: reg.regimenStart,
      visitEnd: reg.regimenEnd,
      department: primary?.department || tlist.find((x) => x.department)?.department || '',
      complaint: complaints.length ? complaints.join('\n\n') : '',
      doctorName: doctors.length ? doctors.join(', ') : primary?.doctorName || '',
      roomName: primary?.roomName || '',
      icd10: primary?.icd10 || reg.icd10 || '',
      interpretation: primary?.interpretation || reg.diseaseDescription || '',
      vitals: null,
      prescriptions: collectForTreatments(tlist, prescriptionsByTreatment, { keepFirst: true }),
      labTests: collectForTreatments(tlist, labsByTreatment),
      surgeries: collectForTreatments(tlist, surgeriesByTreatment),
      hospitalTransfers: (transfersByRegimen.get(rid) || []).map(toHospitalTransfer),
    };
  });
}

module.exports = { getOpenRegimenDocuments, listCompletedRegimens };
