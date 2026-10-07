const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { selectPrescriptionRowsWithDurationFallback, insertMedicalPrescriptionCompat, insertPrescriptionDetailCompat, updateMedicalPrescriptionCompat, selectMedicalPrescriptionMetaCompat } = require('../../common/prescriptionQueryCompat');
const logger = require('../../common/logger');
const { resolvePatientPkFromOpRoute } = require('../../services/emr/patientRouteResolver');
const { BYT_FACILITY_ADDRESS, BYT_FACILITY_CODE, BYT_FACILITY_NAME, BYT_FACILITY_PHONE, BYT_PRESCRIPTION_TYPE, buildPrescriptionMetaNote, generateUniqueBytPrescriptionCode, isBytCodeShape, parsePrescriptionMetaNote, resolveBytDefaultsForPatient } = require('../../services/emr/bytPrescription');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, resolveDoctorDisplayName } = require('../../services/emr/staffIdentity');
const { createTreatmentForPatient, ensureDisease, mysqlInsertId } = require('../../services/emr/treatmentService');

function normalizeMedicalPrescriptionDuration(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 7;
  return n;
}

function normalizePrescriptionLineDuration(value) {
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

// ═══════════════════════════════════════════════
//  PRESCRIPTIONS
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/patients/:patientId/prescriptions
 * Get all prescriptions for a patient
 */
exports.getPrescriptions = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const sqlWithDuration = `SELECT
         rx.order_id,
         rx.time,
         rx.note AS prescriptionNote,
         COALESCE(rx.duration, 7) AS prescriptionDuration,
         d.user_id AS doctorUserId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         COALESCE(pd.duration, 7) AS lineDuration,
         pd.usage,
         pd.unit,
         pd.note AS medNote
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`;

    const sqlLegacy = `SELECT
         rx.order_id,
         rx.time,
         rx.note AS prescriptionNote,
         d.user_id AS doctorUserId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('doctor#', d.user_id)) AS doctorName,
         pd.no AS medNo,
         m.name,
         pd.quantity,
         pd.usage,
         pd.unit,
         pd.note AS medNote
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
       LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
       WHERE r.patient_id = :patientId
       ORDER BY rx.time DESC, pd.no ASC`;

    const rows = await selectPrescriptionRowsWithDurationFallback(
      sequelize,
      sqlWithDuration,
      sqlLegacy,
      { patientId: patientPk }
    );

    const map = new Map();
    for (const row of rows) {
      const key = row.order_id;
      if (!map.has(key)) {
        const parsedMeta = parsePrescriptionMetaNote(row.prescriptionNote);
        const rawBytCode = parsedMeta?.byt?.code;
        const bytCode = isBytCodeShape(rawBytCode) ? String(rawBytCode) : null;
        map.set(key, {
          id: key,
          patientId: patientPk,
          doctorId: row.doctorUserId || req.user.userId,
          doctorName: row.doctorName || '',
          department: parsedMeta.department || 'General',
          duration: Number(row.prescriptionDuration) || 7,
          /** No MEDICAL_PRESCRIPTION.status column — saved Rx is final (UI treats as signed). */
          signatureStatus: 'signed',
          byt: {
            code: bytCode,
            prescriptionType:
              String(parsedMeta?.byt?.prescriptionType || '').toUpperCase() === 'N'
                ? 'N'
                : String(parsedMeta?.byt?.prescriptionType || '').toUpperCase() === 'H'
                  ? 'H'
                  : 'C',
            facilityCode: String(parsedMeta?.byt?.facilityCode || BYT_FACILITY_CODE),
            facilityName: String(parsedMeta?.byt?.facilityName || BYT_FACILITY_NAME),
            facilityAddress: String(parsedMeta?.byt?.facilityAddress || BYT_FACILITY_ADDRESS),
            facilityPhone: String(parsedMeta?.byt?.facilityPhone || BYT_FACILITY_PHONE),
            contactPhone: String(parsedMeta?.byt?.contactPhone || ''),
            guardianName: String(parsedMeta?.byt?.guardianName || ''),
            advice: String(parsedMeta?.byt?.advice || ''),
            insuranceId: String(parsedMeta?.byt?.insuranceId || ''),
            patientAddress: String(parsedMeta?.byt?.patientAddress || ''),
            patientWeightKg: String(parsedMeta?.byt?.patientWeightKg || ''),
            patientIdCard: String(parsedMeta?.byt?.patientIdCard || ''),
            patientPhone: String(parsedMeta?.byt?.patientPhone || ''),
          },
          medications: [],
          createdAt: row.time,
          updatedAt: row.time
        });
      }
      if (row.name) {
        map.get(key).medications.push({
          id: `${key}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
          usage: row.usage || '',
          unit: row.unit || 'tablet',
          note: row.medNote || ''
        });
      }
    }
    const prescriptions = Array.from(map.values());

    res.json({ success: true, prescriptions });
  } catch (error) {
    logger.error({ err: error }, 'Get prescriptions error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/prescriptions
 * Create a new prescription with medications
 */
exports.createPrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const doctorUser = req.user;
    const { department, medications, duration: bodyRxDuration, byt: bodyBytRaw } = req.body;
    const headerDuration = normalizeMedicalPrescriptionDuration(bodyRxDuration);
    const [patientDemo] = await sequelize.query(
      `SELECT u.dob, u.idcard, u.tel
       FROM PATIENT p
       JOIN USER u ON u.id = p.user_id
       WHERE p.patient_id = :patientId
       LIMIT 1`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    const dob = patientDemo?.dob ? new Date(patientDemo.dob) : null;
    const ageMonths = dob && !Number.isNaN(dob.getTime())
      ? Math.max(0, (new Date().getFullYear() - dob.getFullYear()) * 12 + (new Date().getMonth() - dob.getMonth()))
      : null;
    const bodyByt = bodyBytRaw && typeof bodyBytRaw === 'object' ? bodyBytRaw : {};
    const generatedCode = await generateUniqueBytPrescriptionCode(sequelize, {
      facilityCode: BYT_FACILITY_CODE,
      type: BYT_PRESCRIPTION_TYPE,
      transaction,
    });
    const bytDefaults = await resolveBytDefaultsForPatient(
      sequelize,
      patientPk,
      bodyByt,
      patientDemo,
      ageMonths,
      transaction
    );
    const bytMeta = {
      code: generatedCode,
      prescriptionType: BYT_PRESCRIPTION_TYPE,
      facilityCode: BYT_FACILITY_CODE,
      facilityName: String(bodyByt.facilityName || BYT_FACILITY_NAME).trim() || BYT_FACILITY_NAME,
      facilityAddress: String(bodyByt.facilityAddress || BYT_FACILITY_ADDRESS).trim() || BYT_FACILITY_ADDRESS,
      ...bytDefaults,
      patientIdCard: String(patientDemo?.idcard || '').trim(),
      patientPhone: String(patientDemo?.tel || '').trim(),
    };
    if (ageMonths != null && ageMonths < 72) {
      if (!bytMeta.patientWeightKg) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Patient weight is required for children under 72 months' });
      }
      if (!bytMeta.contactPhone) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Contact phone is required for children under 72 months' });
      }
    }


    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
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
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Prescription',
      encounterType: 'Prescription',
      department,
      diseaseId,
      transaction
    });
    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create prescription order' });
    }
    await insertMedicalPrescriptionCompat(sequelize, {
      orderId,
      duration: headerDuration,
      note: buildPrescriptionMetaNote({
        department: department || '',
        byt: bytMeta,
      }),
      transaction,
    });

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim().slice(0, 200);
      if (!medName) continue;
      const lineDur = normalizePrescriptionLineDuration(med.duration);
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id != null ? Number(found[0].id) : null;
      if (!medicineId) {
        const [insMed] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = mysqlInsertId(insMed);
      }
      if (!medicineId) {
        await transaction.rollback();
        return res.status(500).json({ success: false, message: 'Failed to resolve medicine id' });
      }
      const unitNorm = normalizePrescriptionDetailUnit(med.unit);
      const usageNorm = clampPrescriptionUsage(med.usage);
      const noteNorm = clampPrescriptionNote(med.note);
      await insertPrescriptionDetailCompat(sequelize, {
        prescriptionId: orderId,
        no,
        medicineId,
        quantity: Number(med.quantity) || 1,
        duration: lineDur,
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm,
        transaction,
      });
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        duration: String(lineDur),
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm || ''
      });
      no += 1;
    }

    if (meds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication with a name is required' });
    }

    const doctorName = await resolveDoctorDisplayName(req.user);
    const timeRows = await sequelize.query(
      'SELECT time FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1',
      { replacements: { orderId }, type: QueryTypes.SELECT, transaction }
    );
    const rxTime = timeRows[0]?.time;
    const createdAt = rxTime ? new Date(rxTime).toISOString() : new Date().toISOString();
    const prescription = {
      id: orderId,
      patientId: patientPk,
      doctorId: doctorUser.userId,
      doctorName,
      department: department || '',
      duration: headerDuration,
      signatureStatus: 'signed',
      byt: bytMeta,
      medications: meds,
      createdAt,
      updatedAt: createdAt
    };
    await transaction.commit();

    res.status(201).json({ success: true, prescription });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Create prescription error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/patients/:patientId/prescriptions/:id
 * Replace line items of an existing prescription (same ORDER / MEDICAL_PRESCRIPTION).
 */
exports.updatePrescription = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    const orderId = Number(req.params.id);
    if (!patientPk || !Number.isFinite(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient or prescription id' });
    }

    const { department, medications, duration: bodyRxDuration, byt: bodyBytRaw } = req.body;
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication is required' });
    }

    const headerDurationUpd =
      bodyRxDuration !== undefined && bodyRxDuration !== null
        ? normalizeMedicalPrescriptionDuration(bodyRxDuration)
        : null;

    const exists = await sequelize.query(
      `SELECT rx.order_id
       FROM MEDICAL_PRESCRIPTION rx
       JOIN \`ORDER\` o ON o.id = rx.order_id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE rx.order_id = :orderId AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { orderId, patientId: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!exists[0]) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    await sequelize.query('DELETE FROM PRESCRIPTION_DETAIL WHERE prescription_id = :orderId', {
      replacements: { orderId },
      type: QueryTypes.DELETE,
      transaction
    });

    const existingMetaRows = await sequelize.query(
      'SELECT note FROM MEDICAL_PRESCRIPTION WHERE order_id = :orderId LIMIT 1',
      { replacements: { orderId }, type: QueryTypes.SELECT, transaction }
    );
    const existingMeta = parsePrescriptionMetaNote(existingMetaRows[0]?.note);
    const bodyByt = bodyBytRaw && typeof bodyBytRaw === 'object' ? bodyBytRaw : {};
    const existingCode = isBytCodeShape(existingMeta?.byt?.code) ? String(existingMeta.byt.code) : null;
    const bytMeta = {
      code:
        String(bodyByt.code || '').trim() && isBytCodeShape(bodyByt.code)
          ? String(bodyByt.code).trim()
          : existingCode || await generateUniqueBytPrescriptionCode(sequelize, {
              facilityCode: BYT_FACILITY_CODE,
              type: BYT_PRESCRIPTION_TYPE,
              transaction,
            }),
      prescriptionType:
        String(bodyByt.prescriptionType || existingMeta?.byt?.prescriptionType || BYT_PRESCRIPTION_TYPE).toUpperCase() === 'N'
          ? 'N'
          : String(bodyByt.prescriptionType || existingMeta?.byt?.prescriptionType || BYT_PRESCRIPTION_TYPE).toUpperCase() === 'H'
            ? 'H'
            : 'C',
      facilityCode: String(existingMeta?.byt?.facilityCode || BYT_FACILITY_CODE),
      facilityName: String(bodyByt.facilityName || existingMeta?.byt?.facilityName || BYT_FACILITY_NAME).trim() || BYT_FACILITY_NAME,
      facilityAddress: String(bodyByt.facilityAddress || existingMeta?.byt?.facilityAddress || BYT_FACILITY_ADDRESS).trim() || BYT_FACILITY_ADDRESS,
      facilityPhone: String(bodyByt.facilityPhone || existingMeta?.byt?.facilityPhone || BYT_FACILITY_PHONE).trim() || BYT_FACILITY_PHONE,
      contactPhone: String(bodyByt.contactPhone || existingMeta?.byt?.contactPhone || '').trim(),
      guardianName: String(bodyByt.guardianName || existingMeta?.byt?.guardianName || '').trim(),
      advice: String(bodyByt.advice || existingMeta?.byt?.advice || '').trim(),
      insuranceId: String(bodyByt.insuranceId || existingMeta?.byt?.insuranceId || '').trim(),
      patientAddress: String(bodyByt.patientAddress || existingMeta?.byt?.patientAddress || '').trim(),
      patientWeightKg: String(bodyByt.patientWeightKg || existingMeta?.byt?.patientWeightKg || '').trim(),
      patientIdCard: String(existingMeta?.byt?.patientIdCard || '').trim(),
      patientPhone: String(existingMeta?.byt?.patientPhone || '').trim(),
    };
    await updateMedicalPrescriptionCompat(sequelize, {
      orderId,
      transaction,
      setNote: buildPrescriptionMetaNote({
        department: department !== undefined ? department || '' : existingMeta.department || '',
        byt: bytMeta,
      }),
      setDuration: headerDurationUpd != null ? headerDurationUpd : undefined,
    });

    let no = 1;
    const meds = [];
    for (const med of medications) {
      const medName = String(med.name || '').trim().slice(0, 200);
      if (!medName) continue;
      const lineDur = normalizePrescriptionLineDuration(med.duration);
      const found = await sequelize.query(
        'SELECT id FROM MEDICINE WHERE name = :name LIMIT 1',
        { replacements: { name: medName }, type: QueryTypes.SELECT, transaction }
      );
      let medicineId = found[0]?.id != null ? Number(found[0].id) : null;
      if (!medicineId) {
        const [insMed] = await sequelize.query(
          `INSERT INTO MEDICINE (name, manufacturer, description, type, form, unit, dosage, side_effects, contraindications)
           VALUES (:name, 'N/A', NULL, 'General', NULL, 'unit', 'as directed', NULL, NULL)`,
          { replacements: { name: medName }, type: QueryTypes.INSERT, transaction }
        );
        medicineId = mysqlInsertId(insMed);
      }
      if (!medicineId) {
        await transaction.rollback();
        return res.status(500).json({ success: false, message: 'Failed to resolve medicine id' });
      }
      const unitNorm = normalizePrescriptionDetailUnit(med.unit);
      const usageNorm = clampPrescriptionUsage(med.usage);
      const noteNorm = clampPrescriptionNote(med.note);
      await insertPrescriptionDetailCompat(sequelize, {
        prescriptionId: orderId,
        no,
        medicineId,
        quantity: Number(med.quantity) || 1,
        duration: lineDur,
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm,
        transaction,
      });
      meds.push({
        id: `${orderId}-${no}`,
        name: medName,
        quantity: String(Number(med.quantity) || 1),
        duration: String(lineDur),
        usage: usageNorm,
        unit: unitNorm,
        note: noteNorm || ''
      });
      no += 1;
    }

    if (meds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'At least one medication with a name is required' });
    }

    const doctorName = await resolveDoctorDisplayName(req.user);
    const metaRows = await selectMedicalPrescriptionMetaCompat(sequelize, { orderId, transaction });
    const rxTime = metaRows[0]?.time;
    const updatedAt = rxTime ? new Date(rxTime).toISOString() : new Date().toISOString();
    const prescription = {
      id: orderId,
      patientId: patientPk,
      doctorId: req.user.userId,
      doctorName,
      department: department !== undefined ? department || '' : existingMeta.department || '',
      duration: Number(metaRows[0]?.duration) || headerDurationUpd || 7,
      signatureStatus: 'signed',
      byt: bytMeta,
      medications: meds,
      createdAt: updatedAt,
      updatedAt
    };

    await transaction.commit();

    res.json({ success: true, prescription });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Update prescription error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
