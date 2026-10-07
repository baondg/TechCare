const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const logger = require('../../common/logger');
const { resolvePatientPkFromOpRoute } = require('../../services/emr/patientRouteResolver');
const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS, createTreatmentForPatient, ensureDisease, ensureOpenRegimenForDisease, resolveStructuralType } = require('../../services/emr/treatmentService');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, resolveDoctorDisplayName } = require('../../services/emr/staffIdentity');
const { invalidatePatientRecordCache } = require('../../services/emr/patientRecordCache');

/**
 * GET /api/doctor/patients/:patientId/diagnoses
 * Get all diagnoses for a patient
 */
exports.getDiagnoses = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const diagnoses = await sequelize.query(
      `SELECT
         t.id,
         r.patient_id AS patientId,
         d.user_id AS doctorId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         COALESCE(NULLIF(TRIM(dep_dx.name), ''), '') AS department,
         t.\`condition\` AS complaint,
         dis.icd_code AS icd10,
         dis.description AS interpretation,
         '' AS note,
         t.time AS createdAt,
         t.time AS updatedAt
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DEPARTMENT dep_dx ON dep_dx.id = t.dept_id
       LEFT JOIN DISEASE dis ON dis.id = r.disease_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
      WHERE r.patient_id = :patientId
      ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
      ORDER BY t.time DESC, t.id DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, diagnoses });
  } catch (error) {
    logger.error({ err: error }, 'Get diagnoses error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/diagnoses
 * Create a new diagnosis
 */
exports.createDiagnosis = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      doctorUser.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease(icd10, interpretation, transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint,
      department,
      diseaseId,
      forceDiseaseRegimen: true,
      transaction
    });
    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      complaint,
      icd10,
      interpretation: interpretation || '',
      note: note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await transaction.commit();
    await invalidatePatientRecordCache(patientPk);

    res.status(201).json({ success: true, diagnosis });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Create diagnosis error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/patients/:patientId/diagnoses/:id
 * Update an existing diagnosis (TREATMENT row for this patient).
 */
exports.updateDiagnosis = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    const treatmentId = Number(req.params.id);
    if (!patientPk || !Number.isFinite(treatmentId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or diagnosis id' });
    }

    const doctorUser = req.user;
    const { complaint, icd10, interpretation, note, department } = req.body;

    if (!complaint || !icd10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Complaint and ICD-10 code are required' });
    }

    const row = await sequelize.query(
      `SELECT t.id, t.regimen_id, r.patient_id, r.disease_id AS regimen_disease_id
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE t.id = :treatmentId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { treatmentId, patientId: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!row[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Diagnosis not found' });
    }

    const { regimen_disease_id: oldRegimenDiseaseId } = row[0];
    const newDiseaseId = await ensureDisease(icd10, interpretation, transaction);
    const oldD =
      oldRegimenDiseaseId != null && Number.isFinite(Number(oldRegimenDiseaseId))
        ? Number(oldRegimenDiseaseId)
        : null;
    const newD = Number(newDiseaseId);
    const sameDisease = oldD !== null && oldD === newD;

    if (!sameDisease) {
      const newRegimenId = await ensureOpenRegimenForDisease(patientPk, newDiseaseId, transaction);
      await sequelize.query(
        `UPDATE TREATMENT
         SET regimen_id = :newRegimenId,
             \`condition\` = :complaint,
             type = :type
         WHERE id = :treatmentId`,
        {
          replacements: {
            newRegimenId,
            complaint: complaint.trim(),
            type: resolveStructuralType(undefined, department),
            treatmentId,
          },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    } else {
      await sequelize.query(
        `UPDATE TREATMENT
         SET \`condition\` = :complaint,
             type = :type
         WHERE id = :treatmentId`,
        {
          replacements: {
            complaint: complaint.trim(),
            type: resolveStructuralType(undefined, department),
            treatmentId,
          },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }
    if (interpretation != null && String(interpretation).trim() !== '') {
      await sequelize.query(
        'UPDATE DISEASE SET description = :description WHERE id = :diseaseId',
        {
          replacements: { description: String(interpretation).trim(), diseaseId: newDiseaseId },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }

    await transaction.commit();
    await invalidatePatientRecordCache(patientPk);

    const doctorName = await resolveDoctorDisplayName(req);
    const diagnosis = {
      id: treatmentId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      complaint: complaint.trim(),
      icd10: icd10.trim(),
      interpretation: interpretation || '',
      note: note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({ success: true, diagnosis });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Update diagnosis error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
