const appointmentRepository = require('../repositories/appointmentRepository');
const appointmentAiRepository = require('../repositories/appointmentAiRepository');
const { INTERNAL_API_SECRET_HEADER } = require('../middleware/requireInternalApiSecret');
const { normalizeSymptomsForAi } = require('../lib/symptomNormalize');
const logger = require('../common/logger');
const { config } = require('../config/env');
const { AppError, BadRequestError, NotFoundError } = require('../errors/AppError');

const MEDAI_CHAT_ENDPOINT = config.ai.endpoints.chat;
const MEDAI_SYMPTOM_ENDPOINT = config.ai.endpoints.symptom;
const MEDAI_RECOVERY_ENDPOINT = config.ai.endpoints.recovery;

function internalAiFetchHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const secret = config.auth.internalApiSecret;
  if (secret) headers[INTERNAL_API_SECRET_HEADER] = secret;
  return headers;
}

function logAiOrchestration(req, feature, data) {
  const uid = req?.user?.userId ?? req?.user?.id ?? null;
  logger.info(
    {
      requestId: req?.requestId ?? null,
      feature,
      userId: uid,
      ...data,
    },
    'ai.orchestration'
  );
}

function parsePatientJsonField(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function ageFromDobString(dobRaw) {
  if (dobRaw == null || String(dobRaw).trim() === '') return null;
  const s = String(dobRaw).trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const md = today.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function compactPatientContext(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) {
    const out = obj.map(compactPatientContext).filter((x) => x != null && x !== '');
    return out.length ? out : undefined;
  }
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const c = compactPatientContext(v);
    if (
      c !== undefined &&
      c !== null &&
      !(typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0)
    ) {
      out[k] = c;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

async function buildPatientContextForSymptomAnalysis(patientId) {
  const pid = Number(patientId);
  if (!Number.isFinite(pid) || pid <= 0) return {};

  const pRow = await appointmentAiRepository.selectPatientSymptomContextRow(pid);

  const mr = await appointmentAiRepository.selectLatestMedicalRecordForSymptom(pid);

  let currentMedications = [];
  try {
    const medRows = await appointmentAiRepository.listRecentMedicationNamesForSymptom(pid);
    currentMedications = medRows.map((r) => String(r.name || '').trim()).filter(Boolean);
    currentMedications = [...new Set(currentMedications)].slice(0, 15);
  } catch (e) {
    logger.warn({ err: e }, 'buildPatientContextForSymptomAnalysis: currentMedications query skipped');
  }

  const allergies = parsePatientJsonField(pRow?.allergicInfo);
  const history = parsePatientJsonField(pRow?.medicalHistory);

  const height = mr?.height != null ? Number(mr.height) : null;
  const weight = mr?.weight != null ? Number(mr.weight) : null;
  const bmi =
    height && weight && height > 0 ? +((weight / (height / 100) ** 2).toFixed(1)) : null;

  const raw = {
    demographics: {
      sex: pRow?.sex != null ? String(pRow.sex) : null,
      age: ageFromDobString(pRow?.dob),
      bloodType: pRow?.bloodType != null ? String(pRow.bloodType) : null,
    },
    vitalsFromLatestRecord: mr
      ? {
          recordId: mr.id != null ? Number(mr.id) : null,
          recordTime: mr.time || null,
          heightCm: height,
          weightKg: weight,
          bmi,
          bloodPressure: mr.bloodPressure != null ? String(mr.bloodPressure) : null,
          heartRate: mr.heartRate != null ? Number(mr.heartRate) : null,
          respiratoryRate: mr.respiratoryRate != null ? Number(mr.respiratoryRate) : null,
          temperatureC: mr.temperature != null ? Number(mr.temperature) : null,
          spo2Percent: mr.spo2 != null ? Number(mr.spo2) : null,
          symptomsOrNotesInRecord:
            mr.currentSymptoms != null ? String(mr.currentSymptoms).slice(0, 2000) : null,
        }
      : undefined,
    history: {
      chronicConditions: Array.isArray(history.chronicConditions) ? history.chronicConditions : [],
      pastSurgeries: Array.isArray(history.pastSurgeries) ? history.pastSurgeries : [],
      familyHistory: Array.isArray(history.familyHistory) ? history.familyHistory : [],
      pastIllnesses: Array.isArray(history.pastIllnesses) ? history.pastIllnesses : [],
      vaccinations: Array.isArray(history.vaccinations) ? history.vaccinations : [],
      substanceAbuse: Array.isArray(history.substanceAbuse) ? history.substanceAbuse : [],
      drugAllergies: Array.isArray(allergies.drugAllergies) ? allergies.drugAllergies : [],
      foodAllergies: Array.isArray(allergies.foodAllergies) ? allergies.foodAllergies : [],
      otherAllergies: Array.isArray(allergies.otherAllergies) ? allergies.otherAllergies : [],
    },
    currentMedications,
  };

  return compactPatientContext(raw) || {};
}

function normalizeRecoveryPredictionPayload(src) {
  if (!src || typeof src !== 'object') return null;
  let min = Number(src.predicted_recovery_days_min);
  let max = Number(src.predicted_recovery_days_max);
  const single = Number(src.predicted_recovery_days);
  if (!Number.isFinite(min) && Number.isFinite(single)) min = single;
  if (!Number.isFinite(max) && Number.isFinite(single)) max = single;
  if (!Number.isFinite(min)) return null;
  if (!Number.isFinite(max)) max = min;
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  min = Math.max(1, Math.min(365, Math.round(min)));
  max = Math.max(1, Math.min(365, Math.round(max)));
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  const c = String(src.confidence || 'low').toLowerCase();
  const confidence = c === 'high' || c === 'medium' || c === 'low' ? c : 'low';
  const defaultNote =
    'This estimate uses limited information; recovery varies by individual. Follow your care team.';
  const note = String(src.note || '').trim() || defaultNote;
  const defaultDisclaimer =
    'This is not medical advice. Always follow your doctor or nurse instructions.';
  const disclaimer = String(src.disclaimer || '').trim() || defaultDisclaimer;
  return { daysMin: min, daysMax: max, confidence, note, disclaimer };
}

async function patientMeetsRecoveryPredictionCriteria(patientId) {
  const pid = Number(patientId);
  if (!Number.isFinite(pid) || pid <= 0) return false;

  const summary = await buildClinicalSummaryForRecovery(pid);
  const icd = String(summary.currentDiagnosis?.icd10 || '').trim().toUpperCase();
  const interp = String(summary.currentDiagnosis?.interpretation || '').trim();
  if (!icd && !interp) return false;
  if (icd === 'Z00.0') return false;
  const interpLower = interp.toLowerCase();
  if (!icd && interpLower === 'general examination') return false;

  const row = await appointmentAiRepository.selectRecoveryEligiblePrescriptionExists(pid);
  return appointmentAiRepository.isRecoveryEligiblePrescriptionRow(row);
}

async function buildClinicalSummaryForRecovery(patientId) {
  const pid = Number(patientId);
  if (!Number.isFinite(pid) || pid <= 0) return {};

  const diag = await appointmentAiRepository.selectRecoveryLatestDiagnosis(pid);

  const visit = await appointmentAiRepository.selectRecoveryLatestComplaint(pid);

  let recentPrescriptions = [];
  try {
    const rxRows = await appointmentAiRepository.listRecoveryRecentPrescriptionGroups(pid);
    recentPrescriptions = (rxRows || [])
      .map((row) => ({
        prescribedAt: row.prescribedAt,
        medicines: String(row.medicineNames || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((x) => x.medicines.length > 0);
  } catch (e) {
    logger.warn({ err: e }, 'buildClinicalSummaryForRecovery: medications query skipped');
  }

  const out = {};
  if (diag && (diag.icd10 != null || diag.interpretation != null)) {
    out.currentDiagnosis = {
      icd10: diag.icd10 != null ? String(diag.icd10) : '',
      interpretation: diag.interpretation != null ? String(diag.interpretation) : '',
    };
  }
  if (visit?.complaint && String(visit.complaint).trim()) {
    out.latestComplaint = String(visit.complaint).trim().slice(0, 2000);
  }
  if (recentPrescriptions.length) {
    out.recentPrescriptions = recentPrescriptions;
  }
  return out;
}

async function getActiveAiModel() {
  const active = await appointmentAiRepository.selectActiveAiModelRow();
  if (active) return active;
  return appointmentAiRepository.selectFallbackAiModelRow();
}

async function getAiModelById(id) {
  const modelId = Number(id);
  if (!Number.isFinite(modelId) || modelId <= 0) return null;
  return appointmentAiRepository.selectAiModelById(modelId);
}

const NO_MODEL_MESSAGE = 'No AI model configured in AI_MODEL table';

/** Upstream (MedAI) failure shown to the patient with a fixed text; details go to the log only. */
const upstreamError = (status, message) => new AppError(message, status, { expose: true });

async function requirePatientId(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) throw new NotFoundError('Patient profile not found');
  return patientId;
}

async function requireActiveModel() {
  const model = await getActiveAiModel();
  if (!model?.id) throw new BadRequestError(NO_MODEL_MESSAGE);
  return model;
}

const modelSummary = (model) => ({ id: Number(model.id), name: model.name || '', provider: model.provider || '' });

async function getLatestTreatmentIdByPatientId(patientId) {
  return appointmentAiRepository.selectLatestTreatmentIdForPatient(patientId);
}

/** The signed-in patient's AI recommendations (none without a PATIENT row). */
async function getAiRecommendations(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) return [];

  const rows = await appointmentAiRepository.listAiRecommendationsForPatient(patientId);

  const recommendations = (rows || []).map((r) => ({
    id: Number(r.id),
    type: String(r.recType || 'other'),
    content: String(r.content || ''),
    time: r.time || null,
    modelName: r.modelName || '',
    modelProvider: r.modelProvider || '',
    treatmentId: r.treatmentId ?? null,
    feedback: r.feedback || null,
  }));
  return recommendations;
}

/** Stores the patient's feedback on one of their recommendations (id / feedback checked by the route validator). */
async function patchAiRecommendationFeedback(userId, id, body) {
  const patientId = await requirePatientId(userId);
  const recId = Number(id);
  const feedback = String(body.feedback).trim();
  if (!(await appointmentAiRepository.selectAiRecommendationIdForPatient(recId, patientId))) {
    throw new NotFoundError('Recommendation not found');
  }
  await appointmentAiRepository.updateAiRecommendationFeedback(recId, feedback);
  return { id: recId, feedback };
}

/**
 * Patient chat turn through the internal MedAI chat endpoint with the chosen (else active) model;
 * the turn and the reply (as a 'chatbot' recommendation) are saved. `userMessage` / `messages`
 * are checked by the route validator.
 */
async function chatWithAiAndSave(req, userId, body) {
  const patientId = await requirePatientId(userId);
  const userMessage = String(body.userMessage).trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const selectedModelIdRaw = body.modelId;
  let model = null;
  let modelFallbackReason = '';
  if (selectedModelIdRaw !== undefined && selectedModelIdRaw !== null && String(selectedModelIdRaw).trim() !== '') {
    model = await getAiModelById(selectedModelIdRaw);
    if (!model?.id) {
      modelFallbackReason = 'selected-model-invalid';
      model = await getActiveAiModel();
    }
  } else {
    model = await getActiveAiModel();
  }
  if (!model?.id) throw new BadRequestError(NO_MODEL_MESSAGE);

  const payload = {
    messages: [...messages.filter((m) => m && m.role && m.content), { role: 'user', content: userMessage }],
    preferredModel: {
      id: Number(model.id),
      name: model.name || '',
      provider: model.provider || '',
      modelApiId: model.version != null && String(model.version).trim() !== '' ? String(model.version) : '',
    },
  };

  logAiOrchestration(req, 'chat', {
    patientId,
    modelId: model.id,
    modelProvider: model.provider || null,
    hasModelApiId: Boolean(payload.preferredModel.modelApiId),
  });

  let aiResp;
  try {
    aiResp = await fetch(MEDAI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: internalAiFetchHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (upstreamFailure) {
    logger.error({ err: upstreamFailure }, `[chatWithAiAndSave] Cannot reach ${MEDAI_CHAT_ENDPOINT}`);
    throw upstreamError(502, `Cannot connect to AI service at ${MEDAI_CHAT_ENDPOINT}`);
  }

  const aiData = await aiResp.json().catch(() => ({}));
  if (!aiResp.ok) {
    logger.error({ upstreamStatus: aiResp.status, endpoint: MEDAI_CHAT_ENDPOINT }, '[chatWithAiAndSave] Upstream error from medAI');
    throw upstreamError(502, aiData?.message || aiData?.error || 'AI service returned an error');
  }
  const reply = String(aiData.reply || aiData.message || '').trim();
  if (!reply) throw upstreamError(502, 'AI chatbot returned empty response');
  const aiFallback = Boolean(aiData.fallback);
  const aiHint = aiFallback ? String(aiData.hint || '').trim() : '';

  const now = new Date();
  const treatmentId = await getLatestTreatmentIdByPatientId(patientId);
  await appointmentAiRepository.insertChatTurn({
    question: userMessage,
    askTime: now,
    response: reply,
    repTime: now,
    patientId,
    modelId: model.id,
  });
  const [recommendationId] = await appointmentAiRepository.insertAiRecommendation({
    time: now,
    modelId: model.id,
    type: 'chatbot',
    content: reply,
    treatmentId,
    patientId,
  });

  return {
    message: reply,
    recommendationId: Number(recommendationId),
    model: modelSummary(model),
    aiFallback,
    aiHint: aiHint || undefined,
    ...(modelFallbackReason ? { modelFallbackReason } : {}),
  };
}

/** AI_MODEL rows the chat UI can offer. */
async function listAiChatModels() {
  const models = await appointmentAiRepository.listAiModelsOrdered();
  return (models || []).map((m) => ({
    id: Number(m.id),
    name: m.name || `Model #${m.id}`,
    provider: m.provider || '',
    status: m.status || '',
  }));
}

/**
 * Symptom checker: sends the normalized symptoms (validated by the route) with the patient's context
 * to MedAI and saves the result as a 'symptomchecker' recommendation.
 */
async function analyzeSymptomsAndSave(req, userId, body) {
  const patientId = await requirePatientId(userId);
  const symptoms = normalizeSymptomsForAi(body.symptoms);
  const model = await requireActiveModel();

  const patientContext = await buildPatientContextForSymptomAnalysis(patientId);

  const SYMPTOM_AI_UNAVAILABLE_MSG =
    'AI symptom analysis is temporarily unavailable. Please try again later or consult a doctor.';

  logAiOrchestration(req, 'symptom-analysis', {
    patientId,
    modelId: model.id,
    symptomCount: symptoms.length,
  });

  let aiResp;
  try {
    aiResp = await fetch(MEDAI_SYMPTOM_ENDPOINT, {
      method: 'POST',
      headers: internalAiFetchHeaders(),
      body: JSON.stringify({ symptoms, patientContext }),
    });
  } catch (upstreamFailure) {
    logger.error({ err: upstreamFailure }, `[analyzeSymptomsAndSave] Cannot reach ${MEDAI_SYMPTOM_ENDPOINT}`);
    throw upstreamError(503, SYMPTOM_AI_UNAVAILABLE_MSG);
  }
  const aiData = await aiResp.json().catch(() => ({}));
  if (!aiResp.ok) {
    logger.error(
      {
        upstreamStatus: aiResp.status,
        endpoint: MEDAI_SYMPTOM_ENDPOINT,
        upstreamError: aiData?.error || aiData?.message || '(no body)',
        hint: aiData?.hint,
      },
      '[analyzeSymptomsAndSave] Upstream error from medAI'
    );
    throw upstreamError(503, SYMPTOM_AI_UNAVAILABLE_MSG);
  }
  const conditions = Array.isArray(aiData.possible_conditions) ? aiData.possible_conditions : [];
  const recommendedAction = String(aiData.recommended_action || 'Please consult a healthcare professional.');
  const suggestedMedication = Array.isArray(aiData.suggested_medication_type)
    ? aiData.suggested_medication_type
    : [];

  const results = conditions.map((c) => {
    const prob = String(c.probability || '').toLowerCase();
    const severity = prob === 'high' ? 'high' : prob === 'medium' ? 'medium' : 'low';
    return {
      condition: String(c.disease || 'Unknown'),
      severity,
      recommendation: recommendedAction,
      details: String(c.reason || ''),
      possibleCauses: suggestedMedication,
      whenToSeekHelp: 'Consult a doctor if symptoms worsen or do not improve within 48 hours.',
    };
  });

  const disclaimer =
    'This is not a medical diagnosis. Always consult a qualified healthcare professional for proper evaluation and treatment.';

  const treatmentId = await getLatestTreatmentIdByPatientId(patientId);

  const [recommendationId] = await appointmentAiRepository.insertAiRecommendation({
    time: new Date(),
    modelId: model.id,
    type: 'symptomchecker',
    content: JSON.stringify({
      symptoms,
      patientContext,
      possible_conditions: conditions,
      recommended_action: recommendedAction,
    }),
    treatmentId,
    patientId,
  });

  return { analysis: { results, disclaimer }, recommendationId: Number(recommendationId), model: modelSummary(model) };
}

/**
 * Recovery estimate for a patient (patient portal and staff EMR): the cached one (unless `refresh`)
 * while fresh, else a new MedAI prediction saved as a 'recoveryprediction' recommendation. Returns the
 * response body; a patient without a real diagnosis + prescription gets `{ success: false, eligible: false }`.
 */
async function recoveryPredictionForPatient(req, patientId, refresh) {
  if (!(await patientMeetsRecoveryPredictionCriteria(patientId))) {
    return {
      success: false,
      eligible: false,
      message:
        'Recovery estimates are available only with a recorded diagnosis (other than general check-up) and prescribed treatment.',
    };
  }

  const cacheHours = config.cache.recoveryPredictionHours;
  const cacheMs = Math.max(1, Math.min(168, cacheHours)) * 3600000;

  if (!refresh) {
    const cached = await appointmentAiRepository.selectLatestRecoveryPredictionRow(patientId);
    if (cached?.content != null && cached?.time != null) {
      const ageMs = Date.now() - new Date(cached.time).getTime();
      let payload = null;
      try {
        payload = typeof cached.content === 'string' ? JSON.parse(cached.content) : cached.content;
      } catch {
        payload = null;
      }
      if (payload && ageMs >= 0 && ageMs < cacheMs) {
        const prediction = normalizeRecoveryPredictionPayload(payload);
        if (prediction) {
          const meta = payload.aiMeta && typeof payload.aiMeta === 'object' ? payload.aiMeta : {};
          return {
            success: true,
            eligible: true,
            cached: true,
            recommendationId: Number(cached.id),
            prediction,
            model:
              meta.model || meta.provider
                ? { id: null, name: String(meta.model || ''), provider: String(meta.provider || '') }
                : undefined,
          };
        }
      }
    }
  }

  const model = await requireActiveModel();
  const clinicalSummary = await buildClinicalSummaryForRecovery(patientId);
  const patientContext = await buildPatientContextForSymptomAnalysis(patientId);

  const RECOVERY_AI_UNAVAILABLE_MSG =
    'AI recovery prediction is temporarily unavailable. Please try again later.';

  logAiOrchestration(req, 'recovery-prediction', {
    patientId,
    refresh,
    modelId: model.id,
  });

  let aiResp;
  try {
    aiResp = await fetch(MEDAI_RECOVERY_ENDPOINT, {
      method: 'POST',
      headers: internalAiFetchHeaders(),
      body: JSON.stringify({ clinicalSummary, patientContext }),
    });
  } catch (upstreamFailure) {
    logger.error({ err: upstreamFailure }, `[getRecoveryPrediction] Cannot reach ${MEDAI_RECOVERY_ENDPOINT}`);
    throw upstreamError(503, RECOVERY_AI_UNAVAILABLE_MSG);
  }

  const aiData = await aiResp.json().catch(() => ({}));
  if (!aiResp.ok) {
    logger.error(
      {
        upstreamStatus: aiResp.status,
        endpoint: MEDAI_RECOVERY_ENDPOINT,
        upstreamError: aiData?.error || aiData?.message || '(no body)',
        hint: aiData?.hint,
      },
      '[getRecoveryPrediction] Upstream error from medAI'
    );
    throw upstreamError(503, RECOVERY_AI_UNAVAILABLE_MSG);
  }

  const prediction = normalizeRecoveryPredictionPayload(aiData);
  if (!prediction) {
    logger.error({ raw: JSON.stringify(aiData).slice(0, 400) }, '[getRecoveryPrediction] Unusable prediction from medAI');
    throw upstreamError(502, 'Invalid recovery prediction from AI service');
  }

  const treatmentId = await getLatestTreatmentIdByPatientId(patientId);
  const contentObj = {
    clinicalSummary,
    patientContext,
    predicted_recovery_days_min: prediction.daysMin,
    predicted_recovery_days_max: prediction.daysMax,
    confidence: prediction.confidence,
    note: prediction.note,
    disclaimer: prediction.disclaimer,
    aiMeta: { provider: aiData.provider || '', model: aiData.model || '' },
  };

  const [recommendationId] = await appointmentAiRepository.insertAiRecommendation({
    time: new Date(),
    modelId: model.id,
    type: 'recoveryprediction',
    content: JSON.stringify(contentObj),
    treatmentId,
    patientId,
  });

  return {
    success: true,
    eligible: true,
    cached: false,
    recommendationId: Number(recommendationId),
    prediction,
    model: modelSummary(model),
  };
}

module.exports = {
  getAiRecommendations,
  patchAiRecommendationFeedback,
  chatWithAiAndSave,
  listAiChatModels,
  analyzeSymptomsAndSave,
  recoveryPredictionForPatient,
};
