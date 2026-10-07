const treatmentRepository = require('../../repositories/treatmentRepository');
const { isUnknownColumnError } = require('../../common/prescriptionQueryCompat');

const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS, mysqlInsertId } = treatmentRepository;

/** DISEASE.id for an ICD-10 code, creating the row ('General') when it does not exist yet. */
async function ensureDisease(icd10, interpretation, transaction) {
  const found = await treatmentRepository.findDiseaseIdByIcd(icd10, transaction);
  if (found) return found;
  return treatmentRepository.insertDisease(icd10, interpretation || icd10, transaction);
}

/** One open REGIMEN per (patient, disease); disease_id only on REGIMEN. */
async function ensureOpenRegimenForDisease(patientId, diseaseId, transaction) {
  const open = await treatmentRepository.findOpenRegimenIdForDisease(patientId, diseaseId, transaction);
  if (open != null) return open;
  return treatmentRepository.insertOpenRegimen(patientId, diseaseId, transaction);
}

/** Department for a new TREATMENT: latest appointment room → doctor's room → doctor's first department. */
async function resolveDeptIdForTreatment(patientId, doctorId, transaction) {
  return (
    (await treatmentRepository.findLatestAppointmentDeptId(patientId, transaction)) ??
    (await treatmentRepository.findDoctorRoomDeptId(doctorId, transaction)) ??
    treatmentRepository.findDoctorFirstDeptId(doctorId, transaction)
  );
}

/** Stored in `TREATMENT.type` — clinical document / encounter category (not DEPARTMENT.name). */
const ENCOUNTER_KIND = new Set([
  'Clinic transfer',
  'Hospital transfer',
  'Prescription',
  'Lab',
  'Laboratory test',
  'Surgery',
  'Health info',
  'Outpatient',
  'Follow-up reexam slip',
]);

/**
 * Normalize `department` legacy arg: ENCOUNTER_KIND string → structural type column;
 * otherwise treat as human department label for dept_id lookup only / fallback.
 */
function resolveStructuralType(encounterType, department) {
  const et =
    encounterType != null && String(encounterType).trim() !== '' ? String(encounterType).trim() : '';
  if (et && ENCOUNTER_KIND.has(et)) return et;
  const d = department != null ? String(department).trim() : '';
  if (d && ENCOUNTER_KIND.has(d)) return d;
  return 'Outpatient';
}

const positiveIdOrNull = (v) => (v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * Inserts a TREATMENT (one clinical document) for the patient and returns its id.
 *
 * Regimen: diagnoses (`forceDiseaseRegimen`) get the open regimen of their disease; other documents
 * join the current open visit. Without one, a regimen is opened for `diseaseId` (or Z00.0).
 * Department: `deptId`, else a non-encounter `department` label, else resolveDeptIdForTreatment.
 */
async function createTreatmentForPatient({
  patientId,
  doctorId,
  complaint,
  department,
  encounterType,
  diseaseId,
  forceDiseaseRegimen = false,
  deptId: explicitDeptId,
  roomId: explicitRoomId,
  transaction,
}) {
  const hasDisease = diseaseId != null && Number.isFinite(Number(diseaseId));
  let regimenId =
    forceDiseaseRegimen && hasDisease
      ? await ensureOpenRegimenForDisease(patientId, Number(diseaseId), transaction)
      : await treatmentRepository.findOpenRegimenId(patientId, transaction);
  if (!regimenId) {
    const regimenDiseaseId = hasDisease
      ? Number(diseaseId)
      : await ensureDisease('Z00.0', 'General examination', transaction);
    regimenId = await ensureOpenRegimenForDisease(patientId, regimenDiseaseId, transaction);
  }

  let deptId = positiveIdOrNull(explicitDeptId);
  const labelHint = typeof department === 'string' ? department.trim() : '';
  if (!deptId && labelHint && !ENCOUNTER_KIND.has(labelHint)) {
    deptId = await treatmentRepository.findDepartmentIdByLabel(labelHint, transaction);
  }
  if (!deptId) {
    deptId = await resolveDeptIdForTreatment(patientId, doctorId, transaction);
  }

  const values = {
    complaint: complaint || 'General follow-up',
    type: resolveStructuralType(encounterType, department),
    regimenId,
    doctorId,
    deptId,
    roomId: positiveIdOrNull(explicitRoomId),
  };
  try {
    return await treatmentRepository.insertTreatment(values, { withDeptColumn: true }, transaction);
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
  }
  // Older schemas have no TREATMENT.dept_id.
  return treatmentRepository.insertTreatment(values, { withDeptColumn: false }, transaction);
}

module.exports = {
  SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS,
  createTreatmentForPatient,
  ensureDisease,
  ensureOpenRegimenForDisease,
  mysqlInsertId,
  resolveStructuralType,
};
