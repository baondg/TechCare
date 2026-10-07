const fs = require('fs');
const path = require('path');
const labTestRepository = require('../../repositories/labTestRepository');
const orderRepository = require('../../repositories/orderRepository');
const { inTransaction } = require('../../common/transaction');
const { AppError, BadRequestError, NotFoundError } = require('../../errors/AppError');
const { resolvePatientPkFromOpRoute } = require('./patientRouteResolver');
const { MSG_NO_DOCTOR_OR_PRIOR_TREATMENT, getDoctorIdForUserOrLatestForPatient, getTechnicianIdByUserId } = require('./staffIdentity');
const { createTreatmentForPatient, ensureDisease } = require('./treatmentService');

const pad2 = (n) => String(n).padStart(2, '0');
const utcDateTime = (d) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

/**
 * MySQL DATETIME text for a client date: zoned values are converted to UTC, local
 * "YYYY-MM-DD[T ]HH:mm[:ss[.SSS]]" is kept as written, anything else parseable goes through UTC.
 * Null when it cannot be parsed.
 */
function normalizeDateTimeForDb(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;

  // Timezone-aware (Z or offset): format in UTC to avoid MySQL "Incorrect datetime value".
  if (/(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : utcDateTime(d);
  }

  const noT = s.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(noT)) return noT.replace(/\.\d+$/, '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(noT)) return `${noT}:00`;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : utcDateTime(d);
}

/** A number, or null for anything that is not one. */
function toTechnicianId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const isTechnician = (user) => user?.role === 'technician';

async function requirePatientPk(patientIdParam, transaction = null) {
  const patientPk = await resolvePatientPkFromOpRoute(patientIdParam, transaction);
  if (!patientPk) throw new BadRequestError('Invalid patient id');
  return patientPk;
}

/** The patient's lab tests, newest first. */
async function listLabTests(patientIdParam) {
  const patientPk = await requirePatientPk(patientIdParam);
  return labTestRepository.listLabTestsForPatient(patientPk);
}

/**
 * New lab order: TREATMENT ('Lab') + ORDER + PROCEDURE_ ('TEST') + TEST + summary TEST_DETAIL.
 * Technician: `technicianId` from the body, else the signed-in technician's own id.
 * Body: `{ testType, testDate, technicianId?, technicianName?, resultSummary?, fileUrl?, note? }`.
 */
async function createLabTest(patientIdParam, user, body) {
  const patientPk = await requirePatientPk(patientIdParam);
  const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = body;
  if (!testType || !testDate) throw new BadRequestError('testType and testDate are required');
  const testDateSql = normalizeDateTimeForDb(testDate);
  if (!testDateSql) throw new BadRequestError('Invalid testDate format');

  const { orderId, technicianIdResolved } = await inTransaction(async (transaction) => {
    let technicianIdResolved = technicianId !== undefined && technicianId !== null ? toTechnicianId(technicianId) : null;
    if (!technicianIdResolved && isTechnician(user)) {
      technicianIdResolved = await getTechnicianIdByUserId(user.userId, transaction);
    }

    const doctorId = await getDoctorIdForUserOrLatestForPatient(user.userId, patientPk, transaction);
    if (!doctorId) throw new BadRequestError(MSG_NO_DOCTOR_OR_PRIOR_TREATMENT);
    const diseaseId = await ensureDisease('Z00.0', 'General examination', transaction);
    const treatmentId = await createTreatmentForPatient({
      patientId: patientPk,
      doctorId,
      complaint: 'Laboratory test',
      encounterType: 'Lab',
      diseaseId,
      transaction,
    });
    const orderId = await orderRepository.insertActiveOrder(treatmentId, transaction);
    if (orderId == null) throw new AppError('Failed to create lab order', 500, { expose: true });
    await orderRepository.insertProcedure(
      { orderId, note: note || null, technicianId: technicianIdResolved, doctorId, type: 'TEST' },
      transaction
    );
    await labTestRepository.insertLabTest(
      {
        id: orderId,
        time: testDateSql,
        type: testType,
        technicianId: technicianIdResolved,
        result: resultSummary ?? null,
        note: note ?? null,
        attachmentUrl: fileUrl ?? null,
      },
      transaction
    );
    return { orderId, technicianIdResolved };
  });

  return {
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
}

/**
 * Partial update: only the fields present in the body change. A technician editing without
 * `technicianId` assigns the test to themselves. Echoes the body fields back. `id` is the raw route param.
 */
async function updateLabTest(patientIdParam, id, user, body) {
  const patientPk = await requirePatientPk(patientIdParam);
  if (!(await labTestRepository.labTestBelongsToPatient(id, patientPk))) throw new NotFoundError('Lab test not found');
  const { testType, testDate, technicianId, technicianName, resultSummary, fileUrl, note } = body;

  let testDateSql;
  if (testDate !== undefined) {
    testDateSql = normalizeDateTimeForDb(testDate);
    if (!testDateSql) throw new BadRequestError('Invalid testDate format');
  }

  const technicianIdWasProvided = technicianId !== undefined;
  let technicianIdResolved;
  if (technicianIdWasProvided) {
    technicianIdResolved = technicianId === null ? null : toTechnicianId(technicianId);
  } else if (isTechnician(user)) {
    technicianIdResolved = await getTechnicianIdByUserId(user.userId, null);
  }

  // One transaction: TEST, its PROCEDURE_ row and the summary detail change together.
  await inTransaction(async (transaction) => {
    if (technicianIdWasProvided || isTechnician(user)) {
      await labTestRepository.updateTechnician(id, technicianIdResolved ?? null, transaction);
      await orderRepository.updateProcedureTechnician(id, technicianIdResolved ?? null, transaction);
    }
    if (testType !== undefined || testDate !== undefined) {
      await labTestRepository.updateTypeAndTime(id, { type: testType || null, time: testDateSql || null }, transaction);
    }
    if (note !== undefined) {
      await labTestRepository.updateNote(id, note, transaction);
      // Backward compatibility: some older rows still keep the note on PROCEDURE_.
      await orderRepository.updateProcedureNote(id, note, transaction);
    }
    if (fileUrl !== undefined) {
      await labTestRepository.updateAttachmentUrl(id, fileUrl, transaction);
    }
    if (resultSummary !== undefined) {
      await labTestRepository.updateResultSummary(id, resultSummary ?? null, transaction);
    }
  });
  return { id: Number(id), testType, testDate, technicianName, resultSummary, fileUrl, note };
}

/** TEST_DETAIL lines of one of the patient's lab tests. */
async function listLabTestDetails(patientIdParam, idParam) {
  const patientPk = await requirePatientPk(patientIdParam);
  const testId = Number(idParam);
  if (!Number.isFinite(testId) || testId <= 0) throw new BadRequestError('Invalid test id');
  if (!(await labTestRepository.labTestBelongsToPatient(testId, patientPk))) throw new NotFoundError('Lab test not found');
  return labTestRepository.listLabTestDetails(testId);
}

const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Saves a base64 PDF / image under `<cwd>/uploads/lab/` with a generated name.
 * @returns {{ fileUrl: string, fileName: string }}
 */
function saveLabAttachment({ fileName, mimeType, dataBase64 } = {}) {
  if (!fileName || !mimeType || !dataBase64) {
    throw new BadRequestError('fileName, mimeType, dataBase64 are required');
  }
  if (!ATTACHMENT_MIME_TYPES.includes(String(mimeType).toLowerCase())) {
    throw new BadRequestError('Unsupported file type. Only PDF and images are allowed.');
  }

  const cleanName =
    String(fileName)
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'lab-file';
  const ext = path.extname(cleanName) || (String(mimeType).includes('pdf') ? '.pdf' : '.png');
  const outName = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

  const fileBuffer = Buffer.from(String(dataBase64), 'base64');
  if (!fileBuffer.length) throw new BadRequestError('Invalid file content');
  if (fileBuffer.length > MAX_ATTACHMENT_BYTES) throw new BadRequestError('File too large (max 15MB)');

  const uploadsDir = path.join(process.cwd(), 'uploads', 'lab');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, outName), fileBuffer);
  return { fileUrl: `/uploads/lab/${outName}`, fileName: outName };
}

module.exports = { listLabTests, createLabTest, updateLabTest, listLabTestDetails, saveLabAttachment };
