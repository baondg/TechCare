const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

async function selectPatientSymptomContextRow(pid) {
  const [row] = await sequelize.query(
    `SELECT
       p.patient_id AS patientId,
       p.blood_type AS bloodType,
       p.allergic_info AS allergicInfo,
       p.medical_history AS medicalHistory,
       u.sex AS sex,
       u.dob AS dob
     FROM PATIENT p
     JOIN USER u ON u.id = p.user_id
     WHERE p.patient_id = :pid
     LIMIT 1`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return row;
}

async function selectLatestMedicalRecordForSymptom(pid) {
  const [row] = await sequelize.query(
    `SELECT id, time,
            \`condition\` AS currentSymptoms,
            blood_pressure AS bloodPressure,
            heart_rate AS heartRate,
            temperature,
            weight,
            height,
            respiratory_rate AS respiratoryRate,
            spo2
     FROM MEDICAL_RECORD
     WHERE patient_id = :pid
     ORDER BY time DESC, id DESC
     LIMIT 1`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return row;
}

async function listRecentMedicationNamesForSymptom(pid) {
  return sequelize.query(
    `SELECT DISTINCT TRIM(m.name) AS name
     FROM MEDICAL_PRESCRIPTION rx
     JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
     JOIN MEDICINE m ON m.id = pd.medicine_id
     JOIN \`ORDER\` o ON o.id = rx.order_id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :pid
       AND CHAR_LENGTH(TRIM(COALESCE(m.name, ''))) > 0
       AND DATE(rx.time) >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
     ORDER BY rx.time DESC
     LIMIT 25`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
}

async function selectRecoveryEligiblePrescriptionExists(pid) {
  const [row] = await sequelize.query(
    `SELECT 1 AS ok
     FROM MEDICAL_PRESCRIPTION rx
     INNER JOIN \`ORDER\` o ON o.id = rx.order_id
     INNER JOIN TREATMENT t ON t.id = o.treatment_id
     INNER JOIN REGIMEN r ON r.id = t.regimen_id
     INNER JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
     INNER JOIN MEDICINE m ON m.id = pd.medicine_id
     WHERE r.patient_id = :pid
       AND CHAR_LENGTH(TRIM(COALESCE(m.name, ''))) > 0
     LIMIT 1`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return row;
}

/** Row shape from `selectRecoveryEligiblePrescriptionExists` (`SELECT 1 AS ok`). */
function isRecoveryEligiblePrescriptionRow(row) {
  return !!row?.ok;
}

async function selectRecoveryLatestDiagnosis(pid) {
  const [row] = await sequelize.query(
    `SELECT dis.icd_code AS icd10, dis.description AS interpretation
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN DISEASE dis ON dis.id = r.disease_id
     WHERE r.patient_id = :pid
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return row;
}

async function selectRecoveryLatestComplaint(pid) {
  const [row] = await sequelize.query(
    `SELECT t.\`condition\` AS complaint
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :pid
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
  return row;
}

async function listRecoveryRecentPrescriptionGroups(pid) {
  return sequelize.query(
    `SELECT rx.time AS prescribedAt,
            GROUP_CONCAT(DISTINCT NULLIF(TRIM(m.name), '') ORDER BY m.name SEPARATOR ', ') AS medicineNames
     FROM MEDICAL_PRESCRIPTION rx
     JOIN \`ORDER\` o ON o.id = rx.order_id
     JOIN TREATMENT t ON t.id = o.treatment_id
     JOIN REGIMEN r ON r.id = t.regimen_id
     LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
     LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
     WHERE r.patient_id = :pid
     GROUP BY rx.order_id, rx.time
     ORDER BY rx.time DESC
     LIMIT 3`,
    { replacements: { pid }, type: QueryTypes.SELECT }
  );
}

async function selectActiveAiModelRow() {
  const [row] = await sequelize.query(
    `SELECT id, name, provider, version
     FROM AI_MODEL
     WHERE status = 'active'
     ORDER BY release_date DESC, id DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return row;
}

async function selectFallbackAiModelRow() {
  const [row] = await sequelize.query(
    `SELECT id, name, provider, version
     FROM AI_MODEL
     ORDER BY id DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return row;
}

async function selectAiModelById(modelId) {
  const [row] = await sequelize.query(
    `SELECT id, name, provider, version
     FROM AI_MODEL
     WHERE id = :id
     LIMIT 1`,
    { replacements: { id: modelId }, type: QueryTypes.SELECT }
  );
  return row;
}

async function selectLatestTreatmentIdForPatient(patientId) {
  const [row] = await sequelize.query(
    `SELECT t.id
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  return row?.id || null;
}

async function listAiRecommendationsForPatient(patientId) {
  return sequelize.query(
    `SELECT
       ar.id,
       ar.time,
       ar.\`Type\` AS recType,
       ar.content,
       ar.feedback,
       ar.treatment_id AS treatmentId,
       am.name AS modelName,
       am.provider AS modelProvider
     FROM AI_RECOMMENDATION ar
     JOIN AI_MODEL am ON am.id = ar.model_id
     WHERE ar.patient_id = :patientId
     ORDER BY ar.time DESC, ar.id DESC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

async function selectAiRecommendationIdForPatient(recId, patientId) {
  const [row] = await sequelize.query(
    `SELECT ar.id
     FROM AI_RECOMMENDATION ar
     WHERE ar.id = :id AND ar.patient_id = :patientId
     LIMIT 1`,
    { replacements: { id: recId, patientId }, type: QueryTypes.SELECT }
  );
  return row;
}

async function updateAiRecommendationFeedback(recId, feedback) {
  await sequelize.query(
    `UPDATE AI_RECOMMENDATION
     SET feedback = :feedback
     WHERE id = :id`,
    { replacements: { id: recId, feedback }, type: QueryTypes.UPDATE }
  );
}

async function insertChatTurn(replacements) {
  return sequelize.query(
    `INSERT INTO CHAT_TURN (question, ask_time, response, rep_time, patient_id, model_id)
     VALUES (:question, :askTime, :response, :repTime, :patientId, :modelId)`,
    { replacements, type: QueryTypes.INSERT }
  );
}

async function insertAiRecommendation(replacements) {
  return sequelize.query(
    `INSERT INTO AI_RECOMMENDATION (time, model_id, \`Type\`, content, treatment_id, patient_id)
     VALUES (:time, :modelId, :type, :content, :treatmentId, :patientId)`,
    { replacements, type: QueryTypes.INSERT }
  );
}

async function listAiModelsOrdered() {
  return sequelize.query(
    `SELECT id, name, provider, status
     FROM AI_MODEL
     ORDER BY (status = 'active') DESC, release_date DESC, id DESC`,
    { type: QueryTypes.SELECT }
  );
}

async function selectLatestRecoveryPredictionRow(patientId) {
  const [row] = await sequelize.query(
    `SELECT id, time, content
     FROM AI_RECOMMENDATION
     WHERE patient_id = :patientId AND \`Type\` = 'recoveryprediction'
     ORDER BY time DESC, id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  return row;
}

module.exports = {
  selectPatientSymptomContextRow,
  selectLatestMedicalRecordForSymptom,
  listRecentMedicationNamesForSymptom,
  selectRecoveryEligiblePrescriptionExists,
  isRecoveryEligiblePrescriptionRow,
  selectRecoveryLatestDiagnosis,
  selectRecoveryLatestComplaint,
  listRecoveryRecentPrescriptionGroups,
  selectActiveAiModelRow,
  selectFallbackAiModelRow,
  selectAiModelById,
  selectLatestTreatmentIdForPatient,
  listAiRecommendationsForPatient,
  selectAiRecommendationIdForPatient,
  updateAiRecommendationFeedback,
  insertChatTurn,
  insertAiRecommendation,
  listAiModelsOrdered,
  selectLatestRecoveryPredictionRow,
};
