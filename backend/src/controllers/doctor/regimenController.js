const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { selectPrescriptionRowsWithDurationFallback } = require('../../common/prescriptionQueryCompat');
const { notifyDepartmentDoctorsInboundClinicTransfer } = require('../../services/appointmentNotifications');
const logger = require('../../common/logger');
const { resolveCanonicalPatientIdFromEmrParam, resolvePatientPkFromRouteParam } = require('../../services/emr/patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient } = require('../../services/emr/staffIdentity');
const { SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS, createTreatmentForPatient, ensureDisease, mysqlInsertId } = require('../../services/emr/treatmentService');
const { BYT_FACILITY_ADDRESS, BYT_FACILITY_CODE, BYT_FACILITY_NAME, BYT_FACILITY_PHONE, isBytCodeShape, parsePrescriptionMetaNote } = require('../../services/emr/bytPrescription');

function mapMedicalRecordRowToTrackingRow(row) {
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

/**
 * GET /api/doctor/patients/:patientId/regimen/active
 * Open visit (REGIMEN.end IS NULL) for nurse UI sync / status.
 */
exports.getActiveRegimenForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const pid = await resolveCanonicalPatientIdFromEmrParam(req.params.patientId);
    if (!pid) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }
    const emrStrip = Number(String(req.params.patientId || '').replace(/^OP0*/i, ''));
    const apptPatientSql =
      Number.isFinite(emrStrip) && emrStrip > 0
        ? `a.patient_id IN (SELECT p2.patient_id FROM PATIENT p2 WHERE p2.patient_id = :emrStrip OR p2.user_id = :emrStrip)`
        : `a.patient_id = :pid`;

    const [row] = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS startAt
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid }, type: QueryTypes.SELECT }
    );

    /**
     * Room from nurse check-in: prefer APPOINTMENT.regimen_id (set on accept/assign), then date / window
     * around REGIMEN.start (handles timezone vs CURDATE, or legacy rows without regimen_id).
     */
    let checkInRoom = null;
    const regimenId = row ? Number(row.regimenId) : null;
    const regimenStart = row?.startAt != null ? row.startAt : null;

    const roomFromApptRow = (ar) =>
      ar?.roomId != null && Number.isFinite(Number(ar.roomId))
        ? {
            id: Number(ar.roomId),
            name: String(ar.roomName || `Room #${ar.roomId}`).trim() || `Room #${ar.roomId}`,
          }
        : null;

    /** LEFT JOIN: APPOINTMENT.room_id must still resolve if CLINIC_ROOM row is missing (bad FK / seed data). */
    const qApptRoomBase = `
      SELECT a.room_id AS roomId,
             COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
      FROM APPOINTMENT a
      LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
      WHERE (${apptPatientSql})
        AND a.status = 'scheduled'`;

    const apptRepl = (extra = {}) => ({ pid, emrStrip, ...extra });

    if (regimenId) {
      const [linkedAppt] = await sequelize.query(
        `${qApptRoomBase} AND a.regimen_id = :regimenId LIMIT 1`,
        { replacements: apptRepl({ regimenId }), type: QueryTypes.SELECT }
      );
      checkInRoom = roomFromApptRow(linkedAppt);
    }

    /** Same visit: pick scheduled slot whose time is closest to REGIMEN.start (no reliance on CURDATE / regimen_id on row). */
    if (!checkInRoom && row && regimenId) {
      const [closestAppt] = await sequelize.query(
        `SELECT a.room_id AS roomId,
                COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', a.room_id)) AS roomName
         FROM APPOINTMENT a
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         INNER JOIN REGIMEN r ON r.patient_id = a.patient_id AND r.id = :regimenId AND r.\`end\` IS NULL
         WHERE (${apptPatientSql})
           AND a.status = 'scheduled'
           AND a.patient_id IS NOT NULL
           AND a.time BETWEEN DATE_SUB(r.\`start\`, INTERVAL 3 DAY) AND DATE_ADD(r.\`start\`, INTERVAL 2 DAY)
         ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, r.\`start\`)) ASC, a.id DESC
         LIMIT 1`,
        { replacements: apptRepl({ regimenId }), type: QueryTypes.SELECT }
      );
      checkInRoom = roomFromApptRow(closestAppt);
    }

    if (!checkInRoom && pid) {
      if (regimenStart) {
        const [byRegimenDate] = await sequelize.query(
          `${qApptRoomBase} AND DATE(a.time) = DATE(:regimenStart)
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byRegimenDate);
      }

      if (!checkInRoom) {
        const [byCurDate] = await sequelize.query(
          `${qApptRoomBase} AND DATE(a.time) = CURDATE()
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl(), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byCurDate);
      }

      if (!checkInRoom && regimenStart) {
        const [byWindow] = await sequelize.query(
          `${qApptRoomBase}
           AND a.time BETWEEN DATE_SUB(:regimenStart, INTERVAL 5 DAY) AND DATE_ADD(:regimenStart, INTERVAL 2 DAY)
           ORDER BY ABS(TIMESTAMPDIFF(SECOND, a.time, :regimenStart)) ASC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byWindow);
      }

      if (!checkInRoom && regimenStart) {
        const [byTight] = await sequelize.query(
          `${qApptRoomBase}
           AND a.time >= DATE_SUB(:regimenStart, INTERVAL 36 HOUR)
           AND a.time <= DATE_ADD(:regimenStart, INTERVAL 36 HOUR)
           ORDER BY a.time DESC, a.id DESC LIMIT 1`,
          { replacements: apptRepl({ regimenStart }), type: QueryTypes.SELECT }
        );
        checkInRoom = roomFromApptRow(byTight);
      }
    }

    if (!checkInRoom && row) {
      const [trRoom] = await sequelize.query(
        `SELECT t.room_id AS roomId,
                COALESCE(NULLIF(TRIM(cr.name), ''), CONCAT('Room #', t.room_id)) AS roomName
         FROM TREATMENT t
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         INNER JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :pid AND r.\`end\` IS NULL AND t.room_id IS NOT NULL
         ORDER BY t.time ASC, t.id ASC
         LIMIT 1`,
        { replacements: { pid }, type: QueryTypes.SELECT }
      );
      if (trRoom?.roomId != null) {
        checkInRoom = { id: Number(trRoom.roomId), name: String(trRoom.roomName || '') };
      }
    }

    return res.json({
      success: true,
      active: row
        ? { regimenId: Number(row.regimenId), startAt: row.startAt }
        : null,
      checkInRoom,
    });
  } catch (error) {
    logger.error({ err: error }, 'Get active regimen error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/regimen/close
 * Doctor ends the encounter: set REGIMEN.end = NOW() on all open visits for this patient.
 * Nhắc uống thuốc do scheduler BE (7:00, 12:00, 18:00) dựa trên đơn còn trong duration.
 */
exports.closeOpenRegimenForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only a doctor can finish the examination' });
    }
    const pid = await resolveCanonicalPatientIdFromEmrParam(req.params.patientId);
    if (!pid) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }
    const openRows = await sequelize.query(
      `SELECT id FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC`,
      { replacements: { pid }, type: QueryTypes.SELECT }
    );
    if (!openRows.length) {
      return res.status(404).json({
        success: false,
        message: 'No open visit to close. Check-in may not have been completed for this patient.',
      });
    }
    const closedRegimenIds = openRows
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const regimenId = closedRegimenIds[0];
    await sequelize.query(
      `UPDATE REGIMEN SET \`end\` = NOW()
       WHERE patient_id = :pid AND \`end\` IS NULL`,
      { replacements: { pid }, type: QueryTypes.UPDATE }
    );
    const nurseCheckInRepository = require('../../repositories/nurseCheckInRepository');
    await nurseCheckInRepository.completeAppointmentsForClosedRegimens(pid, closedRegimenIds);
    await nurseCheckInRepository.clearAppointmentRegimenLinksForRegimenIds(pid, closedRegimenIds);
    return res.json({ success: true, regimenId, closedRegimenIds, closedCount: closedRegimenIds.length });
  } catch (error) {
    logger.error({ err: error }, 'Close open regimen error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/health-tracking-slips
 * Persist a "health tracking slip" document into current open regimen.
 */
exports.createHealthTrackingSlipForPatient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a doctor can add this document' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!open) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No active regimen found for this patient' });
    }

    const rawIds = Array.isArray(req.body?.recordIds) ? req.body.recordIds : [];
    const recordIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!recordIds.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'recordIds is required' });
    }

    const mrRows = await sequelize.query(
      `SELECT id, time, \`condition\`, blood_pressure, heart_rate, temperature, weight, respiratory_rate, spo2
       FROM MEDICAL_RECORD
       WHERE patient_id = :patientId AND id IN (:recordIds)
       ORDER BY time ASC`,
      {
        replacements: { patientId: patientPk, recordIds },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    if (!mrRows.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No matching health records found' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(req.user.userId, patientPk, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Health tracking slip',
      encounterType: 'Health info',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create order for health tracking slip' });
    }

    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      ms: req.body?.ms != null ? String(req.body.ms).trim() : '',
      admissionNo: req.body?.admissionNo != null ? String(req.body.admissionNo).trim() : '',
      note: req.body?.note != null ? String(req.body.note).trim() : '',
      recordIds: mrRows.map((r) => Number(r.id)),
      rows: mrRows.map(mapMedicalRecordRowToTrackingRow),
    };

    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: {
          orderId,
          note: JSON.stringify(payload),
          doctorId,
          type: 'HEALTH_TRACKING_SLIP',
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      slip: {
        orderId: Number(orderId),
        regimenId: Number(open.regimenId),
        rowsCount: mrRows.length,
      },
    });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'createHealthTrackingSlipForPatient error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/follow-up-reexam-slip
 * Persist PHIẾU HẸN KHÁM LẠI payload into the current open regimen (PROCEDURE_).
 */
exports.createFollowUpReexamSlipForPatient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!['doctor', 'admin'].includes(req.user.role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a doctor can add this document' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [open] = await sequelize.query(
      `SELECT id AS regimenId
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC
       LIMIT 1`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT, transaction }
    );
    if (!open) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No active regimen found for this patient' });
    }

    const slip = req.body?.slip;
    if (!slip || typeof slip !== 'object') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip object is required' });
    }
    if (!String(slip.patientName || '').trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip.patientName is required' });
    }

    let noteJson;
    try {
      noteJson = JSON.stringify(slip);
    } catch {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'slip must be JSON-serializable' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(req.user.userId, patientPk, transaction);
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Follow-up reexam slip',
      encounterType: 'Outpatient',
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create order for follow-up reexam slip' });
    }

    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: {
          orderId,
          note: noteJson,
          doctorId,
          type: 'FOLLOW_UP_REEXAM_SLIP',
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      slip: {
        orderId: Number(orderId),
        regimenId: Number(open.regimenId),
      },
    });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'createFollowUpReexamSlipForPatient error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/patients/:patientId/regimen/active/documents
 * Doctor view: aggregate papers/orders in the currently open REGIMEN.
 * Used by Finish examination step 2/2 review.
 */
exports.getActiveRegimenDocumentsForPatient = async (req, res) => {
  try {
    if (!['doctor', 'admin', 'nurse', 'technician'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const openRows = await sequelize.query(
      `SELECT id AS regimenId, \`start\` AS regimenStart
       FROM REGIMEN
       WHERE patient_id = :pid AND \`end\` IS NULL
       ORDER BY \`start\` DESC, id DESC`,
      { replacements: { pid: patientPk }, type: QueryTypes.SELECT }
    );
    const [open] = openRows;
    if (!open) {
      return res.json({ success: true, regimen: null });
    }
    const regimenIds = Array.from(
      new Set((openRows || []).map((r) => Number(r.regimenId)).filter((id) => Number.isFinite(id) && id > 0))
    );
    if (!regimenIds.length) {
      return res.json({ success: true, regimen: null });
    }
    const regimenId = Number(open.regimenId);
    const regimenIdCsv = regimenIds.join(",");

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const [treatments, diagnosisRows, rxRows, labRows, surgeryRows, hospitalTransferRows, trackingSlipRows, followUpReexamRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${regimenIdCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           t.id AS id,
           t.time AS diagnosedAt,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(dep_dx.name), ''), '') AS department
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DEPARTMENT dep_dx ON dep_dx.id = t.dept_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         WHERE r.patient_id = :patientId
           AND r.id IN (${regimenIdCsv})
           ${SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS}
         ORDER BY t.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           rx.note AS prescriptionNote,
           COALESCE(rx.duration, 7) AS prescriptionDuration,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS usageText,
           pd.unit,
           pd.note AS medNote,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${regimenIdCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           rx.note AS prescriptionNote,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS usageText,
           pd.unit,
           pd.note AS medNote
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${regimenIdCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS id,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${regimenIdCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS id,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${regimenIdCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tr.order_id AS orderId,
           tr.reason,
           tr.time AS transferAt,
           tr.note,
           ht.to_id AS toHospitalId,
           ht.to_name AS toHospitalName,
           ht.transport,
           ht.form_payload AS formPayload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN TRANSFERENCE tr ON tr.order_id = o.id
         INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
         WHERE t.regimen_id IN (${regimenIdCsv})
         ORDER BY tr.time ASC`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.id AS orderId,
           t.time AS createdAt,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             acc.username,
             NULL
           ) AS createdByDoctor,
           p.note AS payload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN PROCEDURE_ p ON p.order_id = o.id
         LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         WHERE t.regimen_id IN (${regimenIdCsv})
           AND p.type = 'HEALTH_TRACKING_SLIP'
         ORDER BY t.time ASC, o.id ASC`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.id AS orderId,
           t.time AS createdAt,
           p.note AS payload
         FROM TREATMENT t
         JOIN \`ORDER\` o ON o.treatment_id = t.id
         JOIN PROCEDURE_ p ON p.order_id = o.id
         WHERE t.regimen_id IN (${regimenIdCsv})
           AND p.type = 'FOLLOW_UP_REEXAM_SLIP'
         ORDER BY t.time ASC, o.id ASC`,
        { type: QueryTypes.SELECT }
      ),
    ]);

    const rxByOrder = new Map();
    for (const row of rxRows || []) {
      if (!rxByOrder.has(row.orderId)) {
        const parsedMeta = parsePrescriptionMetaNote(row.prescriptionNote);
        const rawBytCode = parsedMeta?.byt?.code;
        const bytCode = isBytCodeShape(rawBytCode) ? String(rawBytCode) : null;
        rxByOrder.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt || null,
          duration: Number(row.prescriptionDuration) || 7,
          department: parsedMeta.department || '',
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
        });
      }
      if (row.name) {
        rxByOrder.get(row.orderId).medications.push({
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

    const transfers = (hospitalTransferRows || []).map((row) => ({
      orderId: Number(row.orderId),
      reason: row.reason || '',
      note: row.note || '',
      transferAt: row.transferAt,
      toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
      toHospitalName: row.toHospitalName || '',
      transport: row.transport || null,
      formPayload: normalizeJsonColumn(row.formPayload),
    }));

    const healthTrackingSlips = (trackingSlipRows || []).map((row) => {
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      return {
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
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
    });

    const followUpReexamSlips = (followUpReexamRows || [])
      .map((row) => ({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        slip: normalizeJsonColumn(row.payload),
      }))
      .filter((x) => x.orderId > 0 && x.slip && typeof x.slip === 'object');

    return res.json({
      success: true,
      regimen: {
        regimenId,
        regimenStart: open.regimenStart,
        treatments: treatments || [],
        diagnoses: diagnosisRows || [],
        prescriptions: Array.from(rxByOrder.values()),
        labTests: labRows || [],
        surgeries: surgeryRows || [],
        hospitalTransfers: transfers,
        healthTrackingSlips,
        followUpReexamSlips,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'getActiveRegimenDocumentsForPatient error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/doctor/patients/:patientId/medical-regimens
 * Doctor view: completed encounters (REGIMEN with end set) for one patient.
 */
exports.getPatientMedicalRegimensForDoctor = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient' });
    }

    const regimenRows = await sequelize.query(
      `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
              d.icd_code AS icd10, d.description AS diseaseDescription
       FROM REGIMEN r
       LEFT JOIN DISEASE d ON d.id = r.disease_id
       WHERE r.patient_id = :patientId AND r.end IS NOT NULL
       ORDER BY r.start DESC, r.id DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!regimenRows.length) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
    const idCsv = regimenIds.join(',');

    const normalizeJsonColumn = (val) => {
      if (val == null) return null;
      if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return null;
      }
    };

    const hospitalTransferRows = await sequelize.query(
      `SELECT t.regimen_id AS regimenId,
              tr.order_id AS orderId,
              tr.reason,
              tr.time AS transferAt,
              tr.note,
              ht.to_id AS toHospitalId,
              ht.to_name AS toHospitalName,
              ht.transport,
              ht.form_payload AS formPayload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN TRANSFERENCE tr ON tr.order_id = o.id
       INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
       WHERE t.regimen_id IN (${idCsv})
       ORDER BY tr.time ASC`,
      { type: QueryTypes.SELECT }
    );

    const hospitalTransfersByRegimen = new Map();
    for (const row of hospitalTransferRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!hospitalTransfersByRegimen.has(rid)) hospitalTransfersByRegimen.set(rid, []);
      hospitalTransfersByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        reason: row.reason || '',
        note: row.note || '',
        transferAt: row.transferAt,
        toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
        toHospitalName: row.toHospitalName || '',
        transport: row.transport || null,
        formPayload: normalizeJsonColumn(row.formPayload),
      });
    }

    const [treatments, rxRows, labRows, surgeryRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.regimen_id AS regimenId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN \`USER\` u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId: patientPk }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN \`USER\` u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const treatmentsByRegimen = new Map();
    for (const t of treatments || []) {
      const rid = Number(t.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!treatmentsByRegimen.has(rid)) treatmentsByRegimen.set(rid, []);
      treatmentsByRegimen.get(rid).push(t);
    }

    const regimens = (regimenRows || []).map((reg) => {
      const rid = Number(reg.regimenId);
      const tlist = treatmentsByRegimen.get(rid) || [];
      const primary = tlist[0] || null;

      const prescriptionsDedup = new Map();
      for (const tr of tlist) {
        const tid = tr.treatmentId;
        const ordersMap = rxByTreatment.get(tid) || new Map();
        for (const order of ordersMap.values()) {
          if (!prescriptionsDedup.has(order.id)) prescriptionsDedup.set(order.id, order);
        }
      }
      const prescriptionsList = Array.from(prescriptionsDedup.values());

      const labDedup = new Map();
      for (const tr of tlist) {
        for (const lab of labByTreatment.get(tr.treatmentId) || []) {
          labDedup.set(lab.id, lab);
        }
      }
      const labTests = Array.from(labDedup.values());

      const surgeryDedup = new Map();
      for (const tr of tlist) {
        for (const s of surgeryByTreatment.get(tr.treatmentId) || []) {
          surgeryDedup.set(s.id, s);
        }
      }
      const surgeries = Array.from(surgeryDedup.values());

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
        prescriptions: prescriptionsList,
        labTests,
        surgeries,
        hospitalTransfers: hospitalTransfersByRegimen.get(rid) || [],
      };
    });

    return res.json({ success: true, regimens });
  } catch (error) {
    logger.error({ err: error }, 'getPatientMedicalRegimensForDoctor error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Keep compatibility after dropping PATIENT.in_dept. */
async function syncPatientInDeptFromClinicRoom(patientPk, roomId, transaction) {
  return { patientPk, roomId, transaction, synced: false };
}

/**
 * POST /api/doctor/patients/:patientId/transfers
 * Creates ORDER + TRANSFERENCE + CLINIC_TRANSFERENCE or HOSPITAL_TRANSFERENCE.
 */
exports.createPatientTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromRouteParam(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      req.user.userId,
      patientPk,
      transaction
    );
    if (!doctorId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: MSG_NO_DOCTOR_OR_PRIOR_TREATMENT });
    }

    const {
      kind,
      reason,
      note,
      fromRoomId,
      toRoomId,
      toHospitalId,
      toHospitalName,
      transport,
      formPayload,
    } = req.body || {};

    const k = String(kind || '').toLowerCase();
    if (!reason || !String(reason).trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Transfer reason is required' });
    }
    if (k !== 'clinic' && k !== 'hospital') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'kind must be "clinic" or "hospital"' });
    }

    let clinicTransferToRoomId = null;
    /** Target department (`CLINIC_ROOM.department_id`) — drives header + `inDepartment` after intra-clinic transfer. */
    let transferDeptOverride;
    let transferRoomOverride;
    let clinicFromRoom;
    let clinicToRoom;

    if (k === 'clinic') {
      clinicFromRoom = Number(fromRoomId);
      clinicToRoom = Number(toRoomId);
      if (!Number.isFinite(clinicFromRoom) || clinicFromRoom <= 0 || !Number.isFinite(clinicToRoom) || clinicToRoom <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'fromRoomId and toRoomId are required for clinic transfer' });
      }
      if (clinicFromRoom === clinicToRoom) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'From and to room must differ' });
      }
      transferRoomOverride = clinicToRoom;

      const [crow] = await sequelize.query(
        `SELECT department_id AS deptId FROM CLINIC_ROOM WHERE id = :rid LIMIT 1`,
        { replacements: { rid: clinicToRoom }, type: QueryTypes.SELECT, transaction }
      );
      const destDept = crow?.deptId != null ? Number(crow.deptId) : null;
      if (Number.isFinite(destDept) && destDept > 0) {
        transferDeptOverride = destDept;
      }
    }

    const diseaseId = await ensureDisease('Z75.1', 'Patient transfer', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: String(reason).trim(),
      encounterType: k === 'clinic' ? 'Clinic transfer' : 'Hospital transfer',
      deptId: transferDeptOverride,
      roomId: transferRoomOverride,
      diseaseId,
      transaction,
    });

    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      {
        replacements: { status: 'active', treatmentId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create transfer order' });
    }

    await sequelize.query(
      `INSERT INTO TRANSFERENCE (order_id, reason, time, note)
       VALUES (:orderId, :reason, NOW(), :note)`,
      {
        replacements: {
          orderId,
          reason: String(reason).trim(),
          note: note != null && String(note).trim() !== '' ? String(note).trim() : null,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );

    if (k === 'clinic') {
      await sequelize.query(
        `INSERT INTO CLINIC_TRANSFERENCE (transference_id, from_room_id, to_room_id)
         VALUES (:orderId, :fromRoomId, :toRoomId)`,
        {
          replacements: {
            orderId,
            fromRoomId: clinicFromRoom,
            toRoomId: clinicToRoom,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
      await syncPatientInDeptFromClinicRoom(patientPk, clinicToRoom, transaction);
      clinicTransferToRoomId = clinicToRoom;
    } else {
      const name = String(toHospitalName || '').trim();
      if (!name) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'toHospitalName is required for hospital transfer' });
      }
      let formPayloadJson = null;
      if (formPayload != null && typeof formPayload === 'object') {
        try {
          formPayloadJson = JSON.stringify(formPayload);
        } catch {
          formPayloadJson = null;
        }
      } else if (typeof formPayload === 'string' && String(formPayload).trim() !== '') {
        formPayloadJson = String(formPayload).trim();
      }
      await sequelize.query(
        `INSERT INTO HOSPITAL_TRANSFERENCE (transference_id, to_id, to_name, transport, form_payload)
         VALUES (:orderId, :toId, :toName, :transport, :formPayload)`,
        {
          replacements: {
            orderId,
            toId: toHospitalId != null && String(toHospitalId).trim() !== '' ? String(toHospitalId).trim() : null,
            toName: name,
            transport: transport != null && String(transport).trim() !== '' ? String(transport).trim() : null,
            formPayload: formPayloadJson,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    await transaction.commit();

    if (clinicTransferToRoomId != null) {
      await notifyDepartmentDoctorsInboundClinicTransfer({
        toRoomId: clinicTransferToRoomId,
        patientPk,
        reason: String(reason).trim(),
        note:
          note != null && String(note).trim() !== ''
            ? String(note).trim()
            : '',
      });
    }

    res.status(201).json({
      success: true,
      transfer: {
        orderId,
        treatmentId,
        kind: k,
      },
    });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Create patient transfer error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
