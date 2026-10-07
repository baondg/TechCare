const sequelize = require('../../common/database');
const treatmentRepository = require('../../repositories/treatmentRepository');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolvePatientPkFromOpRoute } = require('./patientRouteResolver');
const { createTreatmentForPatient, ensureDisease, ensureOpenRegimenForDisease, resolveStructuralType } = require('./treatmentService');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, resolveDoctorDisplayName } = require('./staffIdentity');
const { invalidatePatientRecordCache } = require('./patientRecordCache');

async function inTransaction(work) {
  const transaction = await sequelize.transaction();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function requireComplaintAndIcd({ complaint, icd10 }) {
  if (!complaint || !icd10) throw new BadRequestError('Complaint and ICD-10 code are required');
}

/** Response shape shared by create / update (doctorId is the doctor's USER.id). */
async function toDiagnosis({ id, patientPk, user, body, complaint, icd10 }) {
  const now = new Date().toISOString();
  return {
    id,
    patientId: patientPk,
    doctorId: user.userId,
    doctorName: await resolveDoctorDisplayName(user),
    department: body.department || '',
    complaint,
    icd10,
    interpretation: body.interpretation || '',
    note: body.note || '',
    createdAt: now,
    updatedAt: now,
  };
}

/** The patient's diagnoses (standalone TREATMENT rows), newest first. */
async function listDiagnoses(patientIdParam) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  return treatmentRepository.listDiagnosesForPatient(patientPk);
}

/**
 * Records a diagnosis: TREATMENT in the open regimen of the ICD-10 disease (created if needed),
 * attributed to the signed-in doctor or, failing that, the patient's latest treating doctor.
 */
async function createDiagnosis(patientIdParam, user, body) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  requireComplaintAndIcd(body);
  const { complaint, icd10, interpretation, department } = body;

  const treatmentId = await inTransaction(async (transaction) => {
    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const diseaseId = await ensureDisease(icd10, interpretation, transaction);
    const id = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint,
      department,
      diseaseId,
      forceDiseaseRegimen: true,
      transaction,
    });
    return id;
  });
  // Name lookup after commit is fine: it does not touch the new rows.
  const diagnosis = await toDiagnosis({ id: treatmentId, patientPk, user, body, complaint, icd10 });
  await invalidatePatientRecordCache(patientPk);
  return diagnosis;
}

/**
 * Edits complaint / ICD-10 / department of a diagnosis. A different ICD-10 moves the TREATMENT to
 * that disease's open regimen; a non-blank interpretation updates the DISEASE description.
 */
async function updateDiagnosis(patientIdParam, idParam, user, body) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, null);
  const treatmentId = Number(idParam);
  if (!patientPk || !Number.isFinite(treatmentId)) {
    throw new BadRequestError('Invalid patient or diagnosis id');
  }
  requireComplaintAndIcd(body);
  const { complaint, icd10, interpretation, department } = body;

  await inTransaction(async (transaction) => {
    const existing = await treatmentRepository.findTreatmentOfPatient(treatmentId, patientPk, transaction);
    if (!existing) throw new NotFoundError('Diagnosis not found');

    const newDiseaseId = await ensureDisease(icd10, interpretation, transaction);
    const oldDiseaseId =
      existing.regimen_disease_id != null && Number.isFinite(Number(existing.regimen_disease_id))
        ? Number(existing.regimen_disease_id)
        : null;
    const sameDisease = oldDiseaseId !== null && oldDiseaseId === Number(newDiseaseId);
    const regimenId = sameDisease ? null : await ensureOpenRegimenForDisease(patientPk, newDiseaseId, transaction);

    await treatmentRepository.updateTreatment(
      treatmentId,
      { regimenId, complaint: complaint.trim(), type: resolveStructuralType(undefined, department) },
      transaction
    );
    if (interpretation != null && String(interpretation).trim() !== '') {
      await treatmentRepository.updateDiseaseDescription(newDiseaseId, String(interpretation).trim(), transaction);
    }
  });
  await invalidatePatientRecordCache(patientPk);
  return toDiagnosis({ id: treatmentId, patientPk, user, body, complaint: complaint.trim(), icd10: icd10.trim() });
}

module.exports = { listDiagnoses, createDiagnosis, updateDiagnosis };
