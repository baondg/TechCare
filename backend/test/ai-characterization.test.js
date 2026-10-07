/**
 * Characterization of /api/ai/* over the fake DB, with the LLM providers stubbed (outbound fetch
 * is recorded and answered by `state.upstream`, see helpers/characterize.js). Records the model
 * registry reads, the exact provider request (URL, model, prompt) and the HTTP answer. Snapshot
 * captured before routes/ai.ts was split into controller + service (G3 step B).
 */

// Pin the AI environment before the app loads (dotenv never overrides variables already set),
// so a developer's backend/.env cannot change providers or URLs in the snapshot.
process.env.GROQ_API_KEY = '';
process.env.GROQ_MODEL = 'groq-env-model';
process.env.LOCAL_LLM_BASE_URL = 'http://llm.test';
process.env.LOCAL_LLM_MODEL = 'llama3';
process.env.LOCAL_LLM_API_KEY = 'ollama';

const path = require('node:path');

const { characterize, dbError } = require('./helpers/characterize');
const { accessToken } = require('./helpers/fakeDb');

const SNAPSHOT = path.join(__dirname, 'fixtures', 'ai-sql.snapshot.json');

const keyRule = (key, value) => [
  new RegExp(`\`key\` = '${key}';$`),
  [{ id: 1, key, value: JSON.stringify(value), description: null }],
];

/** Admin registry: groq for symptom analysis / recovery, local qwen as the chat default. */
const REGISTRY = [
  keyRule('aiModelCatalog', [{ provider: 'local', modelId: 'catalog-local', enabled: true }]),
  keyRule('aiModels', [
    { provider: 'groq', modelId: 'llama-70b', featureScope: 'symptom-analysis', enabled: true },
    { provider: 'groq', modelId: 'llama-8b', featureScope: 'recovery-prediction', enabled: true },
    { provider: 'local', modelId: 'qwen', featureScope: 'chat', enabled: true },
    { provider: 'local', modelId: 'off', featureScope: 'suggest-medicine', enabled: false },
  ]),
  keyRule('aiDefaultModelByFeature', { chat: { provider: 'local', modelId: 'qwen' } }),
];

const llmReply = (content) => () => ({ status: 200, json: { choices: [{ message: { content } }] } });
const llmDown = () => () => new TypeError('fetch failed');
const llmError = () => () => ({ status: 429, json: { error: 'rate limited' } });

const DOCTOR = { headers: { Authorization: `Bearer ${accessToken({ userId: 5, role: 'DOC', username: 'doc' })}` } };
const PATIENT = { headers: { Authorization: `Bearer ${accessToken({ userId: 9, role: 'PAT', username: 'pat' })}` } };
const INTERNAL = { headers: { Authorization: null } };

const SYMPTOMS = { symptoms: [{ name: 'cough', severity: 'mild', duration: '3 days' }] };

const SCENARIOS = [
  // ---- GET /chat (admin info)
  ['chat info (admin)', 'GET', '/api/ai/chat', null, REGISTRY],
  ['chat info, registry unreadable (legacy schema)', 'GET', '/api/ai/chat', null, [
    [/SYSTEM_CONFIGURATION/, () => Object.assign(new Error('x'), { original: { code: 'ER_BAD_FIELD_ERROR' } })],
  ]],
  ['chat info, doctor is refused', 'GET', '/api/ai/chat', null, [], () => DOCTOR],
  ['chat info, no token', 'GET', '/api/ai/chat', null, [], () => INTERNAL],

  // ---- POST /chat (internal)
  ['chat, messages missing', 'POST', '/api/ai/chat', { systemPrompt: 'x' }, [], () => INTERNAL],
  ['chat, registry default model', 'POST', '/api/ai/chat', {
    messages: [{ role: 'system', content: 'ignored' }, { role: 'user', content: 'Xin chào' }],
    systemPrompt: 'Be brief.',
  }, REGISTRY, (s) => {
    s.upstream = llmReply('Chào bạn!');
    return INTERNAL;
  }],
  ['chat, preferred model from AI_MODEL row', 'POST', '/api/ai/chat', {
    messages: [{ role: 'user', content: 'hi' }],
    preferredModel: { provider: 'GROQ', modelApiId: 'mixtral' },
  }, [], (s) => {
    s.upstream = llmReply('hello');
    return INTERNAL;
  }],
  ['chat, preferred provider without model', 'POST', '/api/ai/chat', {
    messages: [{ role: 'user', content: 'hi' }],
    preferredModel: { provider: 'groq' },
  }, REGISTRY, (s) => {
    s.upstream = llmReply('hello');
    return INTERNAL;
  }],
  ['chat, provider down → canned fallback', 'POST', '/api/ai/chat', {
    messages: [{ role: 'user', content: 'tôi bị đau đầu' }],
  }, [], (s) => {
    s.upstream = llmDown();
    return INTERNAL;
  }],
  ['chat, provider error status', 'POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] }, [], (s) => {
    s.upstream = llmError();
    return INTERNAL;
  }],
  ['chat, registry db down', 'POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] }, [[/./, dbError]], () => INTERNAL],

  // ---- POST /symptom-analysis (internal, Groq only)
  ['symptoms, missing', 'POST', '/api/ai/symptom-analysis', { symptoms: [] }, [], () => INTERNAL],
  ['symptoms, local provider refused', 'POST', '/api/ai/symptom-analysis', SYMPTOMS, [], () => INTERNAL],
  ['symptoms, analysed with context', 'POST', '/api/ai/symptom-analysis', {
    ...SYMPTOMS,
    patientContext: { age: 30, vitals: { temp: 38.2 } },
  }, REGISTRY, (s) => {
    s.upstream = llmReply('Here: {"possible_conditions":[{"name":"Common cold","probability":"high"}],"suggested_medication_type":["antipyretic"]} done');
    return INTERNAL;
  }],
  ['symptoms, context is an array (ignored)', 'POST', '/api/ai/symptom-analysis', {
    ...SYMPTOMS,
    patientContext: [1, 2],
  }, REGISTRY, (s) => {
    s.upstream = llmReply('{"possible_conditions":["flu"],"recommended_action":"Rest","suggested_medication_type":"x"}');
    return INTERNAL;
  }],
  ['symptoms, invalid JSON', 'POST', '/api/ai/symptom-analysis', SYMPTOMS, REGISTRY, (s) => {
    s.upstream = llmReply('{"possible_conditions": [oops}');
    return INTERNAL;
  }],
  ['symptoms, no conditions', 'POST', '/api/ai/symptom-analysis', SYMPTOMS, REGISTRY, (s) => {
    s.upstream = llmReply('Sorry, I cannot help.');
    return INTERNAL;
  }],
  ['symptoms, provider down', 'POST', '/api/ai/symptom-analysis', SYMPTOMS, REGISTRY, (s) => {
    s.upstream = llmDown();
    return INTERNAL;
  }],

  // ---- POST /recovery-prediction (internal)
  ['recovery, range swapped and clamped', 'POST', '/api/ai/recovery-prediction', {
    clinicalSummary: { diagnosis: 'J06' },
    patientContext: { age: 70 },
  }, REGISTRY, (s) => {
    s.upstream = llmReply('{"predicted_recovery_days_min": 500.4, "predicted_recovery_days_max": 0, "confidence": "HIGH", "note": "n", "disclaimer": "d"}');
    return INTERNAL;
  }],
  ['recovery, defaults without registry', 'POST', '/api/ai/recovery-prediction', {
    clinicalSummary: 'not an object',
  }, [], (s) => {
    s.upstream = llmReply('{"predicted_recovery_days_min": "3", "predicted_recovery_days_max": 7, "confidence": "certain", "note": 5}');
    return INTERNAL;
  }],
  ['recovery, missing day range', 'POST', '/api/ai/recovery-prediction', {}, REGISTRY, (s) => {
    s.upstream = llmReply('{"confidence": "low"}');
    return INTERNAL;
  }],
  ['recovery, invalid JSON', 'POST', '/api/ai/recovery-prediction', {}, REGISTRY, (s) => {
    s.upstream = llmReply('{bad json}');
    return INTERNAL;
  }],
  ['recovery, groq down', 'POST', '/api/ai/recovery-prediction', {}, REGISTRY, (s) => {
    s.upstream = llmError();
    return INTERNAL;
  }],
  ['recovery, local down', 'POST', '/api/ai/recovery-prediction', {}, [], (s) => {
    s.upstream = llmDown();
    return INTERNAL;
  }],

  // ---- POST /suggest-medicine (doctor / admin)
  ['suggest medicine, patient refused', 'POST', '/api/ai/suggest-medicine', { diagnosis: 'flu' }, [], () => PATIENT],
  ['suggest medicine, nothing to go on', 'POST', '/api/ai/suggest-medicine', { patientInfo: 'x' }, [], () => DOCTOR],
  ['suggest medicine (vi, default)', 'POST', '/api/ai/suggest-medicine', {
    diagnosis: 'Cảm cúm',
    patientInfo: 'Nam, 30 tuổi',
  }, REGISTRY, (s) => {
    s.upstream = llmReply('Gợi ý: [{"name":"Paracetamol","dosage":"500mg"}]');
    return DOCTOR;
  }],
  ['suggest medicine (en), unparsable list', 'POST', '/api/ai/suggest-medicine', {
    symptoms: 'fever',
    language: 'EN-us',
  }, [], (s) => {
    s.upstream = llmReply('[not json]');
    return DOCTOR;
  }],
  ['suggest medicine, provider down', 'POST', '/api/ai/suggest-medicine', { diagnosis: 'flu' }, [], (s) => {
    s.upstream = llmDown();
  }],

  // ---- POST /recommend-doctor (doctor / admin)
  ['recommend doctor, nothing to go on', 'POST', '/api/ai/recommend-doctor', { preferredDate: '2026-10-10' }, []],
  ['recommend doctor', 'POST', '/api/ai/recommend-doctor', {
    symptoms: 'chest pain',
    preferredDate: '2026-10-10',
    availableDoctors: [{ firstName: 'An', lastName: 'Le', department: 'Cardiology', room: 'A1' }, {}],
  }, [], (s) => {
    s.upstream = llmReply('{"recommendations":[{"doctorName":"An Le","priority":1}],"generalAdvice":"Come early"}');
    return DOCTOR;
  }],
  ['recommend doctor, no JSON in reply', 'POST', '/api/ai/recommend-doctor', { department: 'ENT' }, [], (s) => {
    s.upstream = llmReply('No idea.');
  }],
  ['recommend doctor, provider down', 'POST', '/api/ai/recommend-doctor', { department: 'ENT' }, [], (s) => {
    s.upstream = llmDown();
  }],
];

/** Response timestamps → '<now>'. */
function scrubValue(key, value) {
  if (key === 'timestamp' && typeof value === 'string') return '<now>';
  return undefined;
}

characterize('AI endpoints read the same config, call the same model and answer the same', SNAPSHOT, SCENARIOS, {
  scrubValue,
  // The internal callers (appointmentAiService) read `hint` / `raw` / `fallback` from error answers.
  fullErrorBody: true,
});
