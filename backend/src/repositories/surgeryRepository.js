const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** SURGERY — surgery orders. SURGERY.id is the ORDER id; its note lives on PROCEDURE_. */

/** The patient's surgeries, latest start first, with the surgeon's (or ordering doctor's) name. */
async function listSurgeriesForPatient(patientId) {
  return sequelize.query(
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
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

/** `{ surgeonName }` ("Last First", else username) of DOCTOR `doctorId`, or null when there is none. */
async function findSurgeon(doctorId, transaction) {
  const rows = await sequelize.query(
    `SELECT
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name, ''), ' ', COALESCE(u.first_name, ''))), ''), a.username) AS surgeonName
     FROM DOCTOR d
     JOIN USER u ON u.id = d.user_id
     LEFT JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE d.doctor_id = :doctorId
     LIMIT 1`,
    { replacements: { doctorId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] || null;
}

async function insertSurgery({ id, duration, start, end, result, type, surgeon, urgency }, transaction) {
  await sequelize.query(
    `INSERT INTO SURGERY (id, duration, start, end, result, type, surgeon, urgency, note)
     VALUES (:id, :duration, :start, :end, :result, :type, :surgeon, :urgency, NULL)`,
    {
      replacements: { id, duration, start, end, result, type, surgeon, urgency },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

/** Whether surgery `id` belongs to the patient. */
async function surgeryBelongsToPatient(id, patientId) {
  const rows = await sequelize.query(
    `SELECT s.id
     FROM SURGERY s
     JOIN \`ORDER\` o ON o.id = s.id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE s.id = :id AND r.patient_id = :patientId
     LIMIT 1`,
    { replacements: { id, patientId }, type: QueryTypes.SELECT }
  );
  return Boolean(rows[0]);
}

/** @returns {Promise<{ start, end, type, urgency, surgeon, result } | null>} */
async function findSurgery(id) {
  const rows = await sequelize.query(
    'SELECT start, end, type, urgency, surgeon, result FROM SURGERY WHERE id = :id LIMIT 1',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function updateSurgery(id, { type, start, end, duration, urgency, surgeon, result }) {
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
      replacements: { id, type, start, end, duration, urgency, surgeon, result },
      type: QueryTypes.UPDATE,
    }
  );
}

module.exports = {
  listSurgeriesForPatient,
  findSurgeon,
  insertSurgery,
  surgeryBelongsToPatient,
  findSurgery,
  updateSurgery,
};
