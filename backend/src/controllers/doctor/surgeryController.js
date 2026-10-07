const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const logger = require('../../common/logger');
const { resolvePatientPkFromOpRoute } = require('../../services/emr/patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient } = require('../../services/emr/staffIdentity');
const { createTreatmentForPatient, ensureDisease, mysqlInsertId } = require('../../services/emr/treatmentService');

// ═══════════════════════════════════════════════
//  SURGERIES
// ═══════════════════════════════════════════════

const SURGERY_TYPES = [
  'Minor Surgery',
  'Intermediate Surgery',
  'Major Ambulatory Surgery',
  'Day Surgery'
];

function normalizeSurgeryTypeInput(value) {
  const s = String(value ?? '').trim();
  if (!s) return 'Day Surgery';
  return SURGERY_TYPES.includes(s) ? s : null;
}

exports.getSurgeries = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const surgeries = await sequelize.query(
      `SELECT
         s.id,
         r.patient_id AS patientId,
         s.type AS type,
         s.start AS start,
         s.end AS end,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name, ''), ' ', COALESCE(u.first_name, ''))), ''), a.username, '') AS surgeonName,
         s.urgency AS urgency,
         s.result AS result,
         p.note AS note
       FROM SURGERY s
       JOIN PROCEDURE_ p ON p.order_id = s.id
       JOIN \`ORDER\` o ON o.id = s.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
      LEFT JOIN DOCTOR d ON d.doctor_id = COALESCE(s.surgeon, p.doctor_id)
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE r.patient_id = :patientId
       ORDER BY s.start DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, surgeries });
  } catch (error) {
    logger.error({ err: error }, 'Get surgeries error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createSurgery = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { type, start, end, doctorId: surgeonDoctorIdInput, surgeonName, urgency, result, note } = req.body;
    const typeStr = normalizeSurgeryTypeInput(type);
    if (!typeStr) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${SURGERY_TYPES.join(', ')}`
      });
    }
    const startDt = start ? new Date(start) : new Date();
    const endDt = end ? new Date(end) : new Date(startDt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid start/end; end must be after start' });
    }
    const duration = Math.max(1, Math.round((endDt - startDt) / 60000));
    const urgRaw = String(urgency || 'MEDIUM').toUpperCase();
    const urg = ['HIGH', 'MEDIUM', 'LOW'].includes(urgRaw) ? urgRaw : 'MEDIUM';
    const doctorId = await getDoctorIdForUserOrLatestForPatient(
      req.user.userId,
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
      complaint: 'Surgery',
      encounterType: 'Surgery',
      diseaseId,
      transaction
    });
    const [orderIns] = await sequelize.query(
      'INSERT INTO `ORDER` (status, treatment_id) VALUES (:status, :treatmentId)',
      { replacements: { status: 'active', treatmentId }, type: QueryTypes.INSERT, transaction }
    );
    const orderId = mysqlInsertId(orderIns);
    if (orderId == null) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to create surgery order' });
    }
    const procType = typeStr.length > 100 ? typeStr.slice(0, 100) : typeStr;
    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, NULL, :doctorId, NULL, :type)`,
      {
        replacements: { orderId, note: note || null, doctorId, type: procType },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    let surgeonIdForSave = null;
    let surgeonNameResolved = surgeonName != null && String(surgeonName).trim() ? String(surgeonName).trim().slice(0, 120) : null;
    const surgeonDoctorId = Number(surgeonDoctorIdInput);
    if (Number.isFinite(surgeonDoctorId) && surgeonDoctorId > 0) {
      const surgeonRows = await sequelize.query(
        `SELECT
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name, ''), ' ', COALESCE(u.first_name, ''))), ''), a.username) AS surgeonName
         FROM DOCTOR d
         JOIN USER u ON u.id = d.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
         WHERE d.doctor_id = :doctorId
         LIMIT 1`,
        {
          replacements: { doctorId: surgeonDoctorId },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      if (!surgeonRows[0]) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Invalid doctorId for surgeon' });
      }
      surgeonIdForSave = surgeonDoctorId;
      surgeonNameResolved = String(surgeonRows[0].surgeonName || '').trim().slice(0, 120) || surgeonNameResolved;
    }
    await sequelize.query(
      `INSERT INTO SURGERY (id, duration, start, end, result, type, surgeon, urgency, note)
       VALUES (:id, :duration, :start, :end, :result, :type, :surgeon, :urgency, NULL)`,
      {
        replacements: {
          id: orderId,
          duration,
          start: startDt,
          end: endDt,
          result: result != null && String(result).trim() ? String(result).trim() : null,
          type: typeStr,
          surgeon: surgeonIdForSave,
          urgency: urg
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const surgery = {
      id: orderId,
      patientId: patientPk,
      type: typeStr,
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      surgeonName: surgeonNameResolved,
      urgency: urg,
      result: result != null && String(result).trim() ? String(result).trim() : null,
      note: note != null && String(note).trim() ? String(note).trim() : null
    };
    await transaction.commit();
    res.status(201).json({ success: true, surgery });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Create surgery error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateSurgery = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { id } = req.params;
    const exists = await sequelize.query(
      `SELECT s.id
       FROM SURGERY s
       JOIN \`ORDER\` o ON o.id = s.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE s.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Surgery not found' });
    }
    const { type, start, end, doctorId: surgeonDoctorIdInput, surgeonName, urgency, result, note } = req.body;

    const curRows = await sequelize.query(
      'SELECT start, end, type, urgency, surgeon, result FROM SURGERY WHERE id = :id LIMIT 1',
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const cur = curRows[0];
    if (!cur) {
      return res.status(404).json({ success: false, message: 'Surgery not found' });
    }

    let nextType =
      type !== undefined ? normalizeSurgeryTypeInput(type) : String(cur.type || '').trim() || 'Day Surgery';
    if (type !== undefined && !nextType) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${SURGERY_TYPES.join(', ')}`
      });
    }
    if (!SURGERY_TYPES.includes(nextType)) {
      nextType = 'Day Surgery';
    }
    const nextStart = start !== undefined ? new Date(start) : new Date(cur.start);
    const nextEnd = end !== undefined ? new Date(end) : new Date(cur.end);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd <= nextStart) {
      return res.status(400).json({ success: false, message: 'Invalid start/end; end must be after start' });
    }
    const duration = Math.max(1, Math.round((nextEnd - nextStart) / 60000));
    let nextUrg = cur.urgency;
    if (urgency !== undefined) {
      const u = String(urgency).toUpperCase();
      nextUrg = ['HIGH', 'MEDIUM', 'LOW'].includes(u) ? u : 'MEDIUM';
    }
    let nextSurgeonName =
      surgeonName !== undefined
        ? String(surgeonName).trim()
          ? String(surgeonName).trim().slice(0, 120)
          : null
        : null;
    let nextSurgeonId = cur.surgeon != null ? Number(cur.surgeon) : null;
    const surgeonDoctorId = Number(surgeonDoctorIdInput);
    if (Number.isFinite(surgeonDoctorId) && surgeonDoctorId > 0) {
      const surgeonRows = await sequelize.query(
        `SELECT
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name, ''), ' ', COALESCE(u.first_name, ''))), ''), a.username) AS surgeonName
         FROM DOCTOR d
         JOIN USER u ON u.id = d.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
         WHERE d.doctor_id = :doctorId
         LIMIT 1`,
        { replacements: { doctorId: surgeonDoctorId }, type: QueryTypes.SELECT }
      );
      if (!surgeonRows[0]) {
        return res.status(400).json({ success: false, message: 'Invalid doctorId for surgeon' });
      }
      nextSurgeonId = surgeonDoctorId;
      nextSurgeonName = String(surgeonRows[0].surgeonName || '').trim().slice(0, 120) || nextSurgeonName;
    }
    const nextResult = result !== undefined ? result : cur.result;

    await sequelize.query(
      `UPDATE SURGERY SET
         type = :type,
         start = :start,
         end = :end,
         duration = :duration,
         urgency = :urgency,
         surgeon = :surgeon,
         result = :result
       WHERE id = :id`,
      {
        replacements: {
          id,
          type: nextType,
          start: nextStart,
          end: nextEnd,
          duration,
          urgency: nextUrg,
          surgeon: nextSurgeonId,
          result: nextResult
        },
        type: QueryTypes.UPDATE
      }
    );
    await sequelize.query(
      'UPDATE PROCEDURE_ SET type = :ptype WHERE order_id = :id',
      {
        replacements: {
          id,
          ptype: nextType.length > 100 ? nextType.slice(0, 100) : nextType
        },
        type: QueryTypes.UPDATE
      }
    );
    if (note !== undefined) {
      await sequelize.query('UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id', {
        replacements: { id, note },
        type: QueryTypes.UPDATE
      });
    }

    const nrows = await sequelize.query('SELECT note FROM PROCEDURE_ WHERE order_id = :id LIMIT 1', {
      replacements: { id },
      type: QueryTypes.SELECT
    });
    const noteFinal = nrows[0]?.note ?? null;

    res.json({
      success: true,
      surgery: {
        id: Number(id),
        patientId: patientPk,
        type: nextType,
        start: nextStart.toISOString(),
        end: nextEnd.toISOString(),
        surgeonName: nextSurgeonName,
        urgency: nextUrg,
        result: nextResult,
        note: noteFinal != null ? noteFinal : null
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Update surgery error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
