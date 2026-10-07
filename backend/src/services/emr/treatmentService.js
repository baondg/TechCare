const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { isUnknownColumnError } = require('../../common/prescriptionQueryCompat');

/** MySQL INSERT raw query: first tuple element may be a number or ResultSetHeader. */
function mysqlInsertId(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v.insertId != null) return Number(v.insertId);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** TREATMENT rows tied to ORDER + (SURGERY|TEST|Rx|TRANSFERENCE) are not clinical diagnoses. */
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

async function ensureDisease(icd10, interpretation, transaction) {
  const found = await sequelize.query(
    'SELECT id FROM DISEASE WHERE icd_code = :icd LIMIT 1',
    { replacements: { icd: icd10 }, type: QueryTypes.SELECT, transaction }
  );
  if (found[0]?.id) return found[0].id;

  const [ins] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES (:icd, :description, 'General', NULL)`,
    {
      replacements: { icd: icd10, description: interpretation || icd10 },
      type: QueryTypes.INSERT,
      transaction
    }
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert DISEASE row');
  return id;
}

/** Nurse check-in leaves REGIMEN.end NULL until checkout — attach EMR orders to that encounter. */
async function getOpenRegimenIdForPatient(patientId, transaction) {
  const rows = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND \`end\` IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

/** One open REGIMEN per (patient, disease); disease_id only on REGIMEN. */
async function ensureOpenRegimenForDisease(patientId, diseaseId, transaction) {
  const qOpts = {
    replacements: { patientId, diseaseId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {}),
  };
  const rows = await sequelize.query(
    `SELECT id FROM REGIMEN
     WHERE patient_id = :patientId AND disease_id = :diseaseId AND \`end\` IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    qOpts
  );
  if (rows[0]?.id != null) return Number(rows[0].id);

  const [ins] = await sequelize.query(
    `INSERT INTO REGIMEN (\`start\`, \`end\`, patient_id, disease_id)
     VALUES (NOW(), NULL, :patientId, :diseaseId)`,
    {
      replacements: { patientId, diseaseId },
      type: QueryTypes.INSERT,
      ...(transaction ? { transaction } : {}),
    }
  );
  const id = mysqlInsertId(ins);
  if (id == null) throw new Error('Failed to insert open REGIMEN row');
  return Number(id);
}

async function resolveDeptIdForTreatment(patientId, doctorId, transaction) {
  const queryOpts = {
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {}),
  };

  // 1) Most recent appointment room department for this patient.
  const [apptRow] = await sequelize.query(
    `SELECT cr.department_id AS deptId
     FROM APPOINTMENT a
     JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     WHERE a.patient_id = :patientId
       AND cr.department_id IS NOT NULL
     ORDER BY a.time DESC, a.id DESC
     LIMIT 1`,
    { ...queryOpts, replacements: { patientId } }
  );
  const apptDeptId = apptRow?.deptId != null ? Number(apptRow.deptId) : null;
  if (Number.isFinite(apptDeptId) && apptDeptId > 0) return apptDeptId;

  // 2) Doctor's current room department.
  const [doctorRoomRow] = await sequelize.query(
    `SELECT cr.department_id AS deptId
     FROM DOCTOR d
     LEFT JOIN CLINIC_ROOM cr ON cr.id = d.room_id
     WHERE d.doctor_id = :doctorId
     LIMIT 1`,
    { ...queryOpts, replacements: { doctorId } }
  );
  const roomDeptId = doctorRoomRow?.deptId != null ? Number(doctorRoomRow.deptId) : null;
  if (Number.isFinite(roomDeptId) && roomDeptId > 0) return roomDeptId;

  // 3) First mapped department of doctor (fallback).
  const [doctorDeptRow] = await sequelize.query(
    `SELECT dd.department_id AS deptId
     FROM DOCTOR_DEPARTMENT dd
     WHERE dd.doctor_id = :doctorId
     ORDER BY dd.department_id ASC
     LIMIT 1`,
    { ...queryOpts, replacements: { doctorId } }
  );
  const mappedDeptId = doctorDeptRow?.deptId != null ? Number(doctorDeptRow.deptId) : null;
  return Number.isFinite(mappedDeptId) && mappedDeptId > 0 ? mappedDeptId : null;
}

/** Stored in `TREATMENT.type` — clinical document / encounter category (not DEPARTMENT.name). */
const ENCOUNTER_KIND = new Set([
  'Clinic transfer',
  'Hospital transfer',
  'Prescription',
  'Lab',
  'Laboratory test',
  'Surgery',
  'Health info',
  'Outpatient',
  'Follow-up reexam slip',
]);

async function resolveDeptIdByLabel(label, transaction) {
  const s = label != null ? String(label).trim() : '';
  if (!s) return null;
  const opts = {
    replacements: { name: s, byId: s },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {}),
  };
  const [rowByName] = await sequelize.query(
    `SELECT id FROM DEPARTMENT WHERE TRIM(name) = TRIM(:name) LIMIT 1`,
    opts
  );
  if (rowByName?.id != null) {
    const id = Number(rowByName.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    const [rowByPk] = await sequelize.query(
      `SELECT id FROM DEPARTMENT WHERE id = :byId LIMIT 1`,
      opts
    );
    if (rowByPk?.id != null) return Number(rowByPk.id);
  }
  return null;
}

/**
 * Normalize `department` legacy arg: ENCOUNTER_KIND string → structural type column;
 * otherwise treat as human department label for dept_id lookup only / fallback.
 */
function resolveStructuralType(encounterType, department) {
  const et =
    encounterType != null && String(encounterType).trim() !== '' ? String(encounterType).trim() : '';
  if (et && ENCOUNTER_KIND.has(et)) return et;
  const d = department != null ? String(department).trim() : '';
  if (d && ENCOUNTER_KIND.has(d)) return d;
  return 'Outpatient';
}

async function createTreatmentForPatient({
  patientId,
  doctorId,
  complaint,
  department,
  encounterType,
  diseaseId,
  forceDiseaseRegimen = false,
  deptId: explicitDeptId,
  roomId: explicitRoomId,
  transaction,
}) {
  // Diagnosis records need disease-specific regimen to preserve per-diagnosis ICD on reload.
  // Other documents can still append to the current open visit bucket.
  let regimenId = null;
  if (forceDiseaseRegimen && diseaseId != null && Number.isFinite(Number(diseaseId))) {
    regimenId = await ensureOpenRegimenForDisease(patientId, Number(diseaseId), transaction);
  } else {
    // Keep a single active visit bucket: if an open regimen exists, append all new papers to it.
    // Only create disease-specific/new regimen when there is no currently open visit.
    regimenId = await getOpenRegimenIdForPatient(patientId, transaction);
  }
  if (!regimenId) {
    if (diseaseId != null && Number.isFinite(Number(diseaseId))) {
      regimenId = await ensureOpenRegimenForDisease(patientId, Number(diseaseId), transaction);
    } else {
      const zId = await ensureDisease('Z00.0', 'General examination', transaction);
      regimenId = await ensureOpenRegimenForDisease(patientId, zId, transaction);
    }
  }

  let deptId =
    explicitDeptId != null && Number.isFinite(Number(explicitDeptId)) && Number(explicitDeptId) > 0
      ? Number(explicitDeptId)
      : null;

  const labelHint = typeof department === 'string' ? department.trim() : '';
  if (!deptId && labelHint && !ENCOUNTER_KIND.has(labelHint)) {
    deptId = await resolveDeptIdByLabel(labelHint, transaction);
  }
  if (!deptId) {
    deptId = await resolveDeptIdForTreatment(patientId, doctorId, transaction);
  }

  const structuralType = resolveStructuralType(encounterType, department);
  const roomIdRepl =
    explicitRoomId != null && Number.isFinite(Number(explicitRoomId)) && Number(explicitRoomId) > 0
      ? Number(explicitRoomId)
      : null;

  const baseRepl = {
    complaint: complaint || 'General follow-up',
    type: structuralType,
    regimenId,
    doctorId,
    deptId,
    roomId: roomIdRepl,
  };

  try {
    const [ins] = await sequelize.query(
      `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id, dept_id)
       VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, :roomId, :deptId)`,
      { replacements: baseRepl, type: QueryTypes.INSERT, transaction }
    );
    const tid = mysqlInsertId(ins);
    if (tid == null) throw new Error('Failed to insert TREATMENT row');
    return tid;
  } catch (e) {
    if (!isUnknownColumnError(e)) throw e;
  }

  const [ins] = await sequelize.query(
    `INSERT INTO TREATMENT (time, \`condition\`, type, regimen_id, doctor_id, room_id)
     VALUES (NOW(), :complaint, :type, :regimenId, :doctorId, :roomId)`,
    {
      replacements: {
        complaint: baseRepl.complaint,
        type: baseRepl.type,
        regimenId: baseRepl.regimenId,
        doctorId: baseRepl.doctorId,
        roomId: roomIdRepl,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  const tid = mysqlInsertId(ins);
  if (tid == null) throw new Error('Failed to insert TREATMENT row');
  return tid;
}

module.exports = {
  SQL_AND_TREATMENT_IS_STANDALONE_DIAGNOSIS,
  createTreatmentForPatient,
  ensureDisease,
  ensureOpenRegimenForDisease,
  mysqlInsertId,
  resolveStructuralType,
};
