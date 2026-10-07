/**
 * Characterization of the patient AI endpoints under /api/appointments (chat, symptom analysis,
 * recovery prediction, recommendations + feedback, model list) over the fake DB, with the internal
 * MedAI endpoints stubbed. Snapshot captured before appointmentAiService moved to AppError.
 */
// Fixed upstream URLs (they appear in requests and one error message) and no recovery rate limit.
process.env.MEDAI_CHAT_ENDPOINT = 'http://medai.test/api/ai/chat';
process.env.MEDAI_SYMPTOM_ENDPOINT = 'http://medai.test/api/ai/symptom-analysis';
process.env.MEDAI_RECOVERY_ENDPOINT = 'http://medai.test/api/ai/recovery-prediction';
process.env.AIRECOVERY_RATE_LIMIT_MAX = '1000';

const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'appointment-ai-sql.snapshot.json');

const as = (role, userId) => ({
  headers: { Authorization: `Bearer ${accessToken({ userId, role, username: `${role.toLowerCase()}${userId}` })}` },
});
const PATIENT = as('PAT', 70);
const withPatient = (setup) => (s) => {
  setup?.(s);
  return PATIENT;
};

const ME = [/^SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1$/, [{ patient_id: 7 }]];
const ACTIVE_MODEL = [/FROM AI_MODEL/, (call) => (call.replacements?.id === 99 ? [] : [{ id: 2, name: 'Llama', provider: 'groq', version: 'llama-3.1', status: 'active' }])];
const LATEST_TREATMENT = [/FROM TREATMENT t/, [{ id: 501 }]];
const NEW_RECOMMENDATION = [/^INSERT INTO AI_RECOMMENDATION/, [801, 1]];
const SYMPTOMS = { symptoms: [{ name: 'Cough', severity: 'mild', duration: '1to3days' }] };

/** Patient context lookups (demographics, latest vitals, medications). */
const CONTEXT = [
  [/allergic_info AS allergicInfo|AS allergicInfo/, [{ sex: 'M', dob: '1990-01-15', bloodType: 'O+', allergicInfo: '{"drugAllergies":["penicillin"]}', medicalHistory: 'broken' }]],
  [/FROM MEDICAL_RECORD/, [{ id: 3, time: '2026-09-01T08:00:00.000Z', height: 170, weight: 60, bloodPressure: '120/80', heartRate: 72, currentSymptoms: 'cough' }]],
];

/** Recovery eligibility: a real diagnosis + an eligible prescription. */
const ELIGIBLE = [
  [/AS icd10/, [{ icd10: 'J06', interpretation: 'URI' }]],
  [/SELECT 1 AS ok/, [{ ok: 1 }]],
];

const upstream = (json, status = 200) => () => ({ status, json });
const unreachable = () => new TypeError('fetch failed');

const PREDICTION = { predicted_recovery_days_min: 9, predicted_recovery_days_max: 3, confidence: 'HIGH', note: '', provider: 'groq', model: 'llama' };

const SCENARIOS = [
  // ---- recommendations + feedback + models
  ['recommendations, no patient row', 'GET', '/api/appointments/ai-recommendations', null, [], () => PATIENT],
  ['recommendations', 'GET', '/api/appointments/ai-recommendations', null, [
    ME, [/FROM AI_RECOMMENDATION/, [{ id: '5', recType: null, content: null, time: '2026-09-01', modelName: 'Llama', modelProvider: 'groq', treatmentId: 501, feedback: 'useful' }]],
  ], () => PATIENT],
  ['recommendation feedback, no patient row', 'PATCH', '/api/appointments/ai-recommendations/5/feedback', { feedback: 'useful' }, [], () => PATIENT],
  ['recommendation feedback, not mine', 'PATCH', '/api/appointments/ai-recommendations/5/feedback', { feedback: 'useful' }, [ME], () => PATIENT],
  ['recommendation feedback', 'PATCH', '/api/appointments/ai-recommendations/5/feedback', { feedback: ' useful ' }, [
    ME, [/^SELECT ar.id FROM AI_RECOMMENDATION ar/, [{ id: 5 }]],
  ], () => PATIENT],
  ['models', 'GET', '/api/appointments/ai/models', null, [[/FROM AI_MODEL/, [{ id: 2, name: null, provider: null, status: 'active' }]]], () => PATIENT],

  // ---- chat
  ['chat, no patient row', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [], () => PATIENT],
  ['chat, no model configured', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [ME], () => PATIENT],
  ['chat, AI service unreachable', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [ME, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = unreachable;
  })],
  ['chat, AI service error', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [ME, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = upstream({ error: 'Groq quota exceeded' }, 503);
  })],
  ['chat, empty reply', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [ME, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = upstream({ reply: ' ' });
  })],
  ['chat, unknown model falls back, history filtered', 'POST', '/api/appointments/ai/chat', {
    userMessage: ' Is it serious? ', modelId: 99,
    messages: [{ role: 'user', content: 'I cough' }, { role: 'assistant', content: 'Since when?' }, { content: 'no role' }, null],
  }, [ME, ACTIVE_MODEL, LATEST_TREATMENT, NEW_RECOMMENDATION], withPatient((s) => {
    s.upstream = upstream({ reply: 'Probably not.', fallback: true, hint: 'local model' });
  })],
  ['chat, db down', 'POST', '/api/appointments/ai/chat', { userMessage: 'hi' }, [[/PATIENT/, dbError]], () => PATIENT],

  // ---- symptom analysis
  ['symptoms, no patient row', 'POST', '/api/appointments/ai/symptom-analysis', SYMPTOMS, [], () => PATIENT],
  ['symptoms, no model configured', 'POST', '/api/appointments/ai/symptom-analysis', SYMPTOMS, [ME], () => PATIENT],
  ['symptoms, AI service unreachable', 'POST', '/api/appointments/ai/symptom-analysis', SYMPTOMS, [ME, ACTIVE_MODEL, ...CONTEXT], withPatient((s) => {
    s.upstream = unreachable;
  })],
  ['symptoms, AI service error', 'POST', '/api/appointments/ai/symptom-analysis', SYMPTOMS, [ME, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = upstream({ error: 'model overloaded', hint: 'retry' }, 500);
  })],
  ['symptoms, analysed and saved', 'POST', '/api/appointments/ai/symptom-analysis', SYMPTOMS, [ME, ACTIVE_MODEL, ...CONTEXT, LATEST_TREATMENT, NEW_RECOMMENDATION], withPatient((s) => {
    s.upstream = upstream({
      possible_conditions: [{ disease: 'Common cold', probability: 'High', reason: 'cough' }, { probability: 'x' }],
      recommended_action: 'Rest',
      suggested_medication_type: ['antipyretic'],
    });
  })],

  // ---- recovery prediction
  ['recovery, no patient row', 'GET', '/api/appointments/ai/recovery-prediction', null, [], () => PATIENT],
  ['recovery, not eligible (general check-up)', 'GET', '/api/appointments/ai/recovery-prediction', null, [ME, [/AS icd10/, [{ icd10: 'z00.0', interpretation: '' }]]], () => PATIENT],
  ['recovery, from cache', 'GET', '/api/appointments/ai/recovery-prediction', null, [
    ME, ...ELIGIBLE,
    [/type = 'recoveryprediction'|recoveryprediction/, () => [{ id: 800, time: new Date(Date.now() - 60_000).toISOString(), content: JSON.stringify({ ...PREDICTION, aiMeta: { provider: 'groq', model: 'llama' } }) }]],
  ], () => PATIENT],
  ['recovery, refresh skips the cache', 'GET', '/api/appointments/ai/recovery-prediction?refresh=1', null, [
    ME, ...ELIGIBLE, ACTIVE_MODEL, LATEST_TREATMENT, NEW_RECOMMENDATION,
  ], withPatient((s) => {
    s.upstream = upstream(PREDICTION);
  })],
  ['recovery, no model configured', 'GET', '/api/appointments/ai/recovery-prediction?refresh=true', null, [ME, ...ELIGIBLE], () => PATIENT],
  ['recovery, AI service unreachable', 'GET', '/api/appointments/ai/recovery-prediction?refresh=1', null, [ME, ...ELIGIBLE, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = unreachable;
  })],
  ['recovery, AI service error', 'GET', '/api/appointments/ai/recovery-prediction?refresh=1', null, [ME, ...ELIGIBLE, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = upstream({ message: 'busy' }, 429);
  })],
  ['recovery, unusable prediction', 'GET', '/api/appointments/ai/recovery-prediction?refresh=1', null, [ME, ...ELIGIBLE, ACTIVE_MODEL], withPatient((s) => {
    s.upstream = upstream({ predicted_recovery_days: 'soon' });
  })],
];

/** Times stamped with "now" (chat turns, new recommendations). */
function scrubValue(_key, value) {
  if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Math.abs(Date.parse(value) - Date.now()) < 5 * 60_000)) {
    return '<now>';
  }
  return undefined;
}

characterize('patient AI endpoints: same DB calls, upstream calls and answers', SNAPSHOT, SCENARIOS, { scrubValue });
