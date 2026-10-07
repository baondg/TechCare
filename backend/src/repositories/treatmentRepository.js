const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

/** Adds `transaction` to query options only when there is one. */
const withTx = (transaction, options) => (transaction ? { ...options, transaction } : options);

/** MySQL INSERT raw query: first tuple element may be a number or ResultSetHeader. */
function mysqlInsertId(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v.insertId != null) return Number(v.insertId);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * SQL fragment (alias `t` = TREATMENT): TREATMENT rows tied to ORDER + (SURGERY|TEST|Rx|TRANSFERENCE)
 * are documents, not clinical diagnoses.
 */
const SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS = `
  AND NOT EXISTS (
    SELECT 1 FROM \`ORDER\` o
    WHERE o.treatment_id = t.id
      AND (
        EXISTS (SELECT 1 FROM SURGERY s WHERE s.id = o.id)
        OR EXISTS (SELECT 1 FROM TEST tst WHERE tst.id = o.id)
        OR EXISTS (SELECT 1 FROM MEDICAL_PRESCRIPTION rx WHERE rx.order_id = o.id)
        OR EXISTS (SELECT 1 FROM TRANSFERENCE tf WHERE tf.order_id = o.id)
      )
  )`;

// ─── DISEASE ───

async function findDiseaseIdByIcd(icd, transaction) {
  const rows = await sequelize.query('SELECT id FROM DISEASE WHERE icd_code = :icd LIMIT 1', {
    replacements: { icd },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0]?.id || null;
}

/** @returns {Promise<number>} new DISEASE.id */
async function insertDisease(icd, description, transaction) {
  const [ins] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES (:icd, :description, 'General', NULL)`,
    { replacements: { icd, description }, type: QueryTypes.INSERT, transaction }
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert DISEASE row');
  return id;
}

async function updateDiseaseDescription(diseaseId, description, transaction) {
  await sequelize.query('UPDATE DISEASE SET description = :description WHERE id = :diseaseId', {
    replacements: { description, diseaseId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

// ─── REGIMEN (visit / treatment course) ───

/** Latest REGIMEN without an end (nurse check-in opens one; checkout closes it). */
async function findOpenRegimenId(patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND \`end\` IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

async function findOpenRegimenIdForDisease(patientId, diseaseId, transaction) {
  const rows = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND disease_id = :diseaseId AND \`end\` IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    withTx(transaction, { replacements: { patientId, diseaseId }, type: QueryTypes.SELECT })
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

/** @returns {Promise<number>} new open REGIMEN.id */
async function insertOpenRegimen(patientId, diseaseId, transaction) {
  const [ins] = await sequelize.query(
    `INSERT INTO REGIMEN (\`start\`, \`end\`, patient_id, disease_id)
     VALUES (NOW(), NULL, :patientId, :diseaseId)`,
    withTx(transaction, { replacements: { patientId, diseaseId }, type: QueryTypes.INSERT })
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert open REGIMEN row');
  return Number(id);
}

// ─── Department resolution for a new TREATMENT ───

const positiveIdOrNull = (v) => {
  const n = v != null ? Number(v) : null;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Department of the room of the patient's latest appointment. */
async function findLatestAppointmentDeptId(patientId, transaction) {
  const [row] = await sequelize.query(
    `SELECT cr.department_id AS deptId
     FROM APPOINTMENT a
     JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     WHERE a.patient_id = :patientId
       AND cr.department_id IS NOT NULL
     ORDER BY a.time DESC, a.id DESC
     LIMIT 1`,
    withTx(transaction, { type: QueryTypes.SELECT, replacements: { patientId } })
  );
  return positiveIdOrNull(row?.deptId);
}

/** Department of the doctor's current room. */
async function findDoctorRoomDeptId(doctorId, transaction) {
  const [row] = await sequelize.query(
    `SELECT cr.department_id AS deptId
     FROM DOCTOR d
     LEFT JOIN CLINIC_ROOM cr ON cr.id = d.room_id
     WHERE d.doctor_id = :doctorId
     LIMIT 1`,
    withTx(transaction, { type: QueryTypes.SELECT, replacements: { doctorId } })
  );
  return positiveIdOrNull(row?.deptId);
}

/** Lowest DEPARTMENT id the doctor is mapped to. */
async function findDoctorFirstDeptId(doctorId, transaction) {
  const [row] = await sequelize.query(
    `SELECT dd.department_id AS deptId
     FROM DOCTOR_DEPARTMENT dd
     WHERE dd.doctor_id = :doctorId
     ORDER BY dd.department_id ASC
     LIMIT 1`,
    withTx(transaction, { type: QueryTypes.SELECT, replacements: { doctorId } })
  );
  return positiveIdOrNull(row?.deptId);
}

/** DEPARTMENT id by (trimmed) name, then — for a numeric label — by id. */
async function findDepartmentIdByLabel(label, transaction) {
  const opts = withTx(transaction, { replacements: { name: label, byId: label }, type: QueryTypes.SELECT });
  const [byName] = await sequelize.query('SELECT id FROM DEPARTMENT WHERE TRIM(name) = TRIM(:name) LIMIT 1', opts);
  if (byName?.id != null) return positiveIdOrNull(byName.id);
  const n = Number(label);
  if (Number.isFinite(n) && n > 0) {
    const [byPk] = await sequelize.query('SELECT id FROM DEPARTMENT WHERE id = :byId LIMIT 1', opts);
    if (byPk?.id != null) return Number(byPk.id);
  }
  return null;
}

// ─── TREATMENT ───

/**
 * @param {{ complaint, type, regimenId, doctorId, roomId, deptId }} values
 * @param {{ withDeptColumn: boolean }} schema older databases have no TREATMENT.dept_id
 * @returns {Promise<number>} new TREATMENT.id
 */
async function insertTreatment(values, { withDeptColumn }, transaction) {
  const { complaint, type, regimenId, doctorId, roomId, deptId } = values;
  const [ins] = withDeptColumn
    ? await sequelize.query(
        `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id, dept_id)
       VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, :roomId, :deptId)`,
        {
          replacements: { complaint, type, regimenId, doctorId, deptId, roomId },
          type: QueryTypes.INSERT,
          transaction,
        }
      )
    : await sequelize.query(
        `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id)
     VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, :roomId)`,
        { replacements: { complaint, type, regimenId, doctorId, roomId }, type: QueryTypes.INSERT, transaction }
      );
  const tid = mysqlInsertId(ins);
  if (tid == null) throw new Error('Failed to insert TREATMENT row');
  return tid;
}

/** A patient's clinical diagnoses (standalone TREATMENT rows), newest first, as the EMR shows them. */
async function listDiagnosesForPatient(patientId) {
  return sequelize.query(
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
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

/** @returns {Promise<{ id, regimen_id, patient_id, regimen_disease_id } | null>} */
async function findTreatmentOfPatient(treatmentId, patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT t.id, t.regimen_id, r.patient_id, r.disease_id AS regimen_disease_id
       FROM TREATMENT t
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE t.id = :treatmentId AND r.patient_id = :patientId
       LIMIT 1`,
    { replacements: { treatmentId, patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] || null;
}

/** Updates complaint + type, and moves the row to `regimenId` when given. */
async function updateTreatment(treatmentId, { regimenId, complaint, type }, transaction) {
  const moving = regimenId != null;
  await sequelize.query(
    `UPDATE TREATMENT
         SET ${moving ? 'regimen_id = :newRegimenId,\n             ' : ''}\`condition\` = :complaint,
             type = :type
         WHERE id = :treatmentId`,
    {
      replacements: { ...(moving ? { newRegimenId: regimenId } : {}), complaint, type, treatmentId },
      type: QueryTypes.UPDATE,
      transaction,
    }
  );
}

module.exports = {
  SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS,
  mysqlInsertId,
  findDiseaseIdByIcd,
  insertDisease,
  updateDiseaseDescription,
  findOpenRegimenId,
  findOpenRegimenIdForDisease,
  insertOpenRegimen,
  findLatestAppointmentDeptId,
  findDoctorRoomDeptId,
  findDoctorFirstDeptId,
  findDepartmentIdByLabel,
  insertTreatment,
  listDiagnosesForPatient,
  findTreatmentOfPatient,
  updateTreatment,
};
