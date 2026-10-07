const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const fs = require('fs');
const path = require('path');
const logger = require('../../common/logger');
const { resolvePatientPkFromOpRoute } = require('../../services/emr/patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, getTechnicianIdByUserId } = require('../../services/emr/staffIdentity');
const { createTreatmentForPatient, ensureDisease, mysqlInsertId } = require('../../services/emr/treatmentService');

function normalizeDateTimeForDb(value) {
  const s = String(value ?? '').trim()
  if (!s) return null

  // If timezone-aware (has Z or offset), format in UTC to avoid MySQL "Incorrect datetime value".
  if (/(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  }

  // Handle "YYYY-MM-DDTHH:mm:ss[.SSS]" or "YYYY-MM-DD HH:mm[:ss]" without timezone.
  const noT = s.replace('T', ' ')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(noT)) {
    return noT.replace(/\.\d+$/, '')
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(noT)) {
    return `${noT}:00`
  }

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ═══════════════════════════════════════════════
//  LAB TESTS
// ═══════════════════════════════════════════════

exports.getLabTests = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const rows = await sequelize.query(
      `SELECT
         tst.id,
         r.patient_id AS patientId,
         COALESCE(tst.technician_id, p.technician_id) AS technicianId,
         tst.type AS testType,
         tst.time AS testDate,
         COALESCE(td.result, tst.result) AS resultSummary,
         COALESCE(tst.note, p.note) AS note,
         tst.attachment_url AS fileUrl,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           a.username
         ) AS technicianName
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
       LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
       LEFT JOIN USER u ON u.id = te.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
       LEFT JOIN TEST_DETAIL td ON td.test_id = tst.id AND td.no = 1
       WHERE r.patient_id = :patientId
       ORDER BY tst.time DESC`,
      { replacements: { patientId: patientPk }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, labTests: rows });
  } catch (error) {
    logger.error({ err: error }, 'Get lab tests error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createLabTest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, transaction);
    if (!patientPk) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = req.body;
    if (!testType || !testDate) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'testType and testDate are required' });
    }
    const testDateSql = normalizeDateTimeForDb(testDate);
    if (!testDateSql) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid testDate format' });
    }

    let technicianIdResolved = null;
    if (technicianId !== undefined && technicianId !== null) {
      const n = Number(technicianId);
      technicianIdResolved = Number.isFinite(n) ? n : null;
    }
    if (!technicianIdResolved && req.user?.role === 'technician') {
      technicianIdResolved = await getTechnicianIdByUserId(req.user.userId, transaction);
    }

    let doctorId = await getDoctorIdForUserOrLatestForPatient(
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
      complaint: 'Laboratory test',
      encounterType: 'Lab',
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
      return res.status(500).json({ success: false, message: 'Failed to create lab order' });
    }
    await sequelize.query(
      `INSERT INTO PROCEDURE_ (order_id, note, technician_id, doctor_id, room_id, type)
       VALUES (:orderId, :note, :technicianId, :doctorId, NULL, 'TEST')`,
      {
        replacements: { orderId, note: note || null, technicianId: technicianIdResolved, doctorId },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    await sequelize.query(
      'INSERT INTO TEST (id, time, type, technician_id, result, note, attachment_url) VALUES (:id, :time, :type, :technicianId, :result, :note, :attachment_url)',
      {
        replacements: {
          id: orderId,
          time: testDateSql,
          type: testType,
          technicianId: technicianIdResolved,
          result: resultSummary ?? null,
          note: note ?? null,
          attachment_url: fileUrl ?? null,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    await sequelize.query(
      'INSERT INTO TEST_DETAIL (test_id, no, `index`, result) VALUES (:testId, 1, :idx, :result)',
      {
        replacements: { testId: orderId, idx: 'summary', result: resultSummary || '' },
        type: QueryTypes.INSERT,
        transaction
      }
    );
    const labTest = {
      id: orderId,
      patientId: patientPk,
      testType,
      testDate,
      technicianId: technicianIdResolved,
      technicianName: technicianName || null,
      resultSummary: resultSummary || null,
      fileUrl: fileUrl || null,
      note: note || null,
    };
    await transaction.commit();
    res.status(201).json({ success: true, labTest });
  } catch (error) {
    await transaction.rollback();
    logger.error({ err: error }, 'Create lab test error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateLabTest = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    const { id } = req.params;
    const exists = await sequelize.query(
      `SELECT tst.id
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE tst.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }
    const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = req.body;

    let testDateSql;
    if (testDate !== undefined) {
      testDateSql = normalizeDateTimeForDb(testDate);
      if (!testDateSql) {
        return res.status(400).json({ success: false, message: 'Invalid testDate format' });
      }
    }

    let technicianIdResolved;
    const technicianIdWasProvided = technicianId !== undefined;
    if (technicianIdWasProvided) {
      if (technicianId === null) technicianIdResolved = null;
      else {
        const n = Number(technicianId);
        technicianIdResolved = Number.isFinite(n) ? n : null;
      }
    } else if (req.user?.role === 'technician') {
      technicianIdResolved = await getTechnicianIdByUserId(req.user.userId, null);
    }

    // Update technician mapping (supports technician role + manual selection).
    if (technicianIdWasProvided || req.user?.role === 'technician') {
      await sequelize.query(
        'UPDATE TEST SET technician_id = :technicianId WHERE id = :id',
        { replacements: { id, technicianId: technicianIdResolved ?? null }, type: QueryTypes.UPDATE }
      );
      await sequelize.query(
        'UPDATE PROCEDURE_ SET technician_id = :technicianId WHERE order_id = :id',
        { replacements: { id, technicianId: technicianIdResolved ?? null }, type: QueryTypes.UPDATE }
      );
    }

    if (testType !== undefined || testDate !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET type = COALESCE(:type, type), time = COALESCE(:time, time) WHERE id = :id',
        { replacements: { id, type: testType || null, time: testDateSql || null }, type: QueryTypes.UPDATE }
      );
    }
    if (note !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET note = :note WHERE id = :id',
        { replacements: { id, note }, type: QueryTypes.UPDATE }
      );
      // Backward compatibility: some older rows might still store value in PROCEDURE_.note
      await sequelize.query(
        'UPDATE PROCEDURE_ SET note = :note WHERE order_id = :id',
        { replacements: { id, note }, type: QueryTypes.UPDATE }
      );
    }
    if (fileUrl !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET attachment_url = :fileUrl WHERE id = :id',
        { replacements: { id, fileUrl }, type: QueryTypes.UPDATE }
      );
    }
    if (resultSummary !== undefined) {
      await sequelize.query(
        'UPDATE TEST SET result = :result WHERE id = :id',
        { replacements: { id, result: resultSummary ?? null }, type: QueryTypes.UPDATE }
      );
      await sequelize.query(
        `INSERT INTO TEST_DETAIL (test_id, no, \`index\`, result)
         VALUES (:id, 1, 'summary', :result)
         ON DUPLICATE KEY UPDATE result = VALUES(result)`,
        { replacements: { id, result: resultSummary || '' }, type: QueryTypes.INSERT }
      );
    }
    res.json({ success: true, labTest: { id: Number(id), testType, testDate, technicianName, resultSummary, fileUrl, note } });
  } catch (error) {
    logger.error({ err: error }, 'Update lab test error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getLabTestDetails = async (req, res) => {
  try {
    const patientPk = await resolvePatientPkFromOpRoute(req.params.patientId, null);
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }

    const testId = Number(req.params.id);
    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid test id' });
    }

    const exists = await sequelize.query(
      `SELECT tst.id
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE tst.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id: testId, patientId: patientPk }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }

    const details = await sequelize.query(
      `SELECT
         test_id AS testId,
         no,
         \`index\` AS itemIndex,
         result,
         unit
       FROM TEST_DETAIL
       WHERE test_id = :testId
       ORDER BY no ASC`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, details });
  } catch (error) {
    logger.error({ err: error }, 'Get lab test details error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.uploadLabAttachment = async (req, res) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body || {};
    if (!fileName || !mimeType || !dataBase64) {
      return res.status(400).json({ success: false, message: 'fileName, mimeType, dataBase64 are required' });
    }

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(String(mimeType).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Unsupported file type. Only PDF and images are allowed.' });
    }

    const cleanName = String(fileName)
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'lab-file';

    const ext = path.extname(cleanName) || (String(mimeType).includes('pdf') ? '.pdf' : '.png');
    const outName = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'lab');
    ensureDir(uploadsDir);
    const outPath = path.join(uploadsDir, outName);

    const fileBuffer = Buffer.from(String(dataBase64), 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ success: false, message: 'Invalid file content' });
    }
    if (fileBuffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File too large (max 15MB)' });
    }

    fs.writeFileSync(outPath, fileBuffer);
    const fileUrl = `/uploads/lab/${outName}`;
    return res.json({ success: true, fileUrl, fileName: outName });
  } catch (error) {
    logger.error({ err: error }, 'Upload lab attachment error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
