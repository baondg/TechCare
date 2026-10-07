const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** TEST (+ TEST_DETAIL summary line) — lab orders. TEST.id is the ORDER id. */

/** The patient's lab tests, newest first, with technician name and the summary result. */
async function listLabTestsForPatient(patientId) {
  return sequelize.query(
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
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

/** Whether lab test `id` belongs to the patient. */
async function labTestBelongsToPatient(id, patientId) {
  const rows = await sequelize.query(
    `SELECT tst.id
     FROM TEST tst
     JOIN \`ORDER\` o ON o.id = tst.id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE tst.id = :id AND r.patient_id = :patientId
     LIMIT 1`,
    { replacements: { id, patientId }, type: QueryTypes.SELECT }
  );
  return Boolean(rows[0]);
}

/** TEST row plus its TEST_DETAIL summary line (no 1). */
async function insertLabTest({ id, time, type, technicianId, result, note, attachmentUrl }, transaction) {
  await sequelize.query(
    'INSERT INTO TEST (id, time, type, technician_id, result, note, attachment_url) VALUES (:id, :time, :type, :technicianId, :result, :note, :attachment_url)',
    {
      replacements: { id, time, type, technicianId, result, note, attachment_url: attachmentUrl },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  await sequelize.query('INSERT INTO TEST_DETAIL (test_id, no, `index`, result) VALUES (:testId, 1, :idx, :result)', {
    replacements: { testId: id, idx: 'summary', result: result || '' },
    type: QueryTypes.INSERT,
    transaction,
  });
}

async function updateTechnician(id, technicianId) {
  await sequelize.query('UPDATE TEST SET technician_id = :technicianId WHERE id = :id', {
    replacements: { id, technicianId },
    type: QueryTypes.UPDATE,
  });
}

/** null `type` / `time` keep the stored value. */
async function updateTypeAndTime(id, { type, time }) {
  await sequelize.query('UPDATE TEST SET type = COALESCE(:type, type), time = COALESCE(:time, time) WHERE id = :id', {
    replacements: { id, type, time },
    type: QueryTypes.UPDATE,
  });
}

async function updateNote(id, note) {
  await sequelize.query('UPDATE TEST SET note = :note WHERE id = :id', {
    replacements: { id, note },
    type: QueryTypes.UPDATE,
  });
}

async function updateAttachmentUrl(id, fileUrl) {
  await sequelize.query('UPDATE TEST SET attachment_url = :fileUrl WHERE id = :id', {
    replacements: { id, fileUrl },
    type: QueryTypes.UPDATE,
  });
}

/** TEST.result and the TEST_DETAIL summary line (created when missing). */
async function updateResultSummary(id, result) {
  await sequelize.query('UPDATE TEST SET result = :result WHERE id = :id', {
    replacements: { id, result },
    type: QueryTypes.UPDATE,
  });
  await sequelize.query(
    `INSERT INTO TEST_DETAIL (test_id, no, \`index\`, result)
     VALUES (:id, 1, 'summary', :result)
     ON DUPLICATE KEY UPDATE result = VALUES(result)`,
    { replacements: { id, result: result || '' }, type: QueryTypes.INSERT }
  );
}

async function listLabTestDetails(testId) {
  return sequelize.query(
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
}

module.exports = {
  listLabTestsForPatient,
  labTestBelongsToPatient,
  insertLabTest,
  updateTechnician,
  updateTypeAndTime,
  updateNote,
  updateAttachmentUrl,
  updateResultSummary,
  listLabTestDetails,
};
