/**
 * The AI features behind /api/ai: chat, symptom analysis, recovery prediction (all three called
 * server-to-server by appointmentAiService), and the doctor-facing medicine suggestions and doctor
 * recommendations. Provider / model selection lives in ./llmClient, prompts in ./prompts.
 */
import logger from '../../common/logger';
import { config } from '../../config/env';
import { BadRequestError } from '../../errors/AppError';
import {
  callAI,
  ChatMessage,
  ChatRequest,
  getActiveProvider,
  getLocalLLMConfig,
  resolveChatExecutionModel,
  resolveProviderAndModel,
} from './llmClient';
import {
  getFallbackResponse,
  MEDICINE_SUGGEST_PROMPT_EN,
  MEDICINE_SUGGEST_PROMPT_VI,
  RECOVERY_PREDICTION_PROMPT,
  SYMPTOM_ANALYSIS_PROMPT,
} from './prompts';

/**
 * An AI failure answered with a feature-specific body (`hint`, `raw`…) that the internal callers
 * read — not the standard error shape. The controller sends `body` with `status` as-is.
 */
export class AiResponseError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>
  ) {
    super(String(body.error ?? 'AI request failed'));
    this.name = 'AiResponseError';
  }
}

type JsonObject = Record<string, unknown>;

const isPlainObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);

/** First `{…}` (or `[…]`) in a model reply, parsed; `empty` when there is none. Throws on bad JSON. */
function extractJson<T>(reply: string, pattern: RegExp, empty: T): T {
  const match = reply.match(pattern);
  return match ? (JSON.parse(match[0]) as T) : empty;
}

const JSON_OBJECT = /\{[\s\S]*\}/;
const JSON_ARRAY = /\[[\s\S]*\]/;

/** GET /chat: which provider / model chat uses (admin diagnostics). */
export async function getChatInfo() {
  const resolved = await resolveProviderAndModel('chat');
  return {
    status: 'ok',
    message: 'AI Chat API is running!',
    provider: resolved.provider === 'groq' ? 'Groq Cloud API' : 'Local LLM (OpenAI-compatible)',
    model: resolved.model,
    endpoints: {
      test: 'GET /api/ai/chat',
      chat: 'POST /api/ai/chat',
      suggestMedicine: 'POST /api/ai/suggest-medicine',
      recommendDoctor: 'POST /api/ai/recommend-doctor',
    },
    env: {
      GROQ_API_KEY: config.ai.groq.apiKey ? '***set***' : '(not set — using local LLM)',
      LOCAL_LLM_BASE_URL: getLocalLLMConfig().baseUrl,
      LOCAL_LLM_MODEL: getLocalLLMConfig().model,
    },
  };
}

/**
 * Chat reply. Never fails once the request is valid: if the provider (or model lookup) fails,
 * answers 200 with a canned reply, `fallback: true` and a hint.
 */
export async function chat(body: ChatRequest) {
  const { messages, systemPrompt } = body || ({} as ChatRequest);
  if (!messages || !Array.isArray(messages)) {
    throw new BadRequestError('Invalid request. "messages" array is required.');
  }
  try {
    const resolved = await resolveChatExecutionModel(body);
    const reply = await callAI(messages, 'chat', systemPrompt, resolved);
    return { message: reply, timestamp: new Date().toISOString(), provider: resolved.provider, model: resolved.model };
  } catch (error) {
    logger.error({ err: error }, '[AI] Error');
    const userMessage = (messages as ChatMessage[]).filter((m) => m.role === 'user').pop()?.content ?? '';
    return {
      message: getFallbackResponse(userMessage),
      fallback: true,
      hint:
        getActiveProvider() === 'groq'
          ? 'Groq API unavailable (details in server logs)'
          : `Local LLM unavailable. Start Ollama or set GROQ_API_KEY in backend/.env`,
    };
  }
}

/**
 * Possible conditions for patient-reported symptoms. Groq only (local models are not trusted
 * with this). Errors: 503 (no Groq / provider failure), 502 (unusable model output).
 */
export async function analyzeSymptoms({ symptoms, patientContext }: { symptoms?: unknown; patientContext?: unknown }) {
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    throw new BadRequestError('symptoms array is required');
  }
  const context = isPlainObject(patientContext) ? patientContext : null;

  try {
    const userContent = [
      'Patient-reported symptoms (JSON):',
      JSON.stringify(symptoms, null, 2),
      context && Object.keys(context).length
        ? `\nLatest patient profile / vitals / history (JSON; may be partial):\n${JSON.stringify(context, null, 2)}`
        : '\nNo structured patient profile/vitals were provided beyond symptoms.',
      '\nReturn only the JSON object as specified.',
    ].join('\n');
    const resolved = await resolveProviderAndModel('symptom-analysis');
    if (resolved.provider !== 'groq') {
      throw new AiResponseError(503, {
        error: 'AI symptom analysis requires Groq API',
        hint: 'Set a valid GROQ_API_KEY in backend/.env (local LLM is not used for symptom analysis).',
      });
    }
    const reply = await callAI([{ role: 'user', content: userContent }], 'symptom-analysis', SYMPTOM_ANALYSIS_PROMPT, resolved);

    let parsed: JsonObject;
    try {
      parsed = extractJson<JsonObject>(reply, JSON_OBJECT, {});
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] symptom-analysis JSON parse failed');
      throw new AiResponseError(502, { error: 'AI returned invalid JSON for symptom analysis', raw: reply.slice(0, 500) });
    }

    const possible_conditions = Array.isArray(parsed.possible_conditions) ? parsed.possible_conditions : [];
    if (possible_conditions.length === 0) {
      throw new AiResponseError(502, {
        error: 'AI returned no symptom analysis results',
        hint: 'Check GROQ_API_KEY and quota, then try again.',
      });
    }
    return {
      possible_conditions,
      recommended_action:
        typeof parsed.recommended_action === 'string'
          ? parsed.recommended_action
          : 'Please consult a healthcare professional.',
      suggested_medication_type: Array.isArray(parsed.suggested_medication_type) ? parsed.suggested_medication_type : [],
      provider: resolved.provider,
      model: resolved.model,
    };
  } catch (error) {
    if (error instanceof AiResponseError) throw error;
    logger.error({ err: error }, '[AI] symptom-analysis error');
    throw new AiResponseError(503, {
      error: 'Symptom analysis failed',
      hint: 'Check GROQ_API_KEY is valid in backend/.env, then try again.',
    });
  }
}

/** Orders and clamps a model's day range to whole days within 1..365. */
function normalizeDayRange(min: number, max: number): [number, number] {
  let lo = Math.round(min);
  let hi = Math.round(max);
  if (lo > hi) [lo, hi] = [hi, lo];
  lo = Math.max(1, Math.min(365, lo));
  hi = Math.max(1, Math.min(365, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

/**
 * Expected recovery time (days) from a clinical summary. Errors: 502 (unusable model output),
 * 503 (provider failure, with a hint for the provider in use).
 */
export async function predictRecovery({ clinicalSummary, patientContext }: { clinicalSummary?: unknown; patientContext?: unknown }) {
  let resolvedProvider: 'groq' | 'local' = getActiveProvider();
  try {
    const summary = isPlainObject(clinicalSummary) ? clinicalSummary : {};
    const context = isPlainObject(patientContext) ? patientContext : {};
    const userContent = [
      'clinicalSummary (JSON):',
      JSON.stringify(summary, null, 2),
      Object.keys(context).length
        ? `\npatientContext (JSON; may be partial):\n${JSON.stringify(context, null, 2)}`
        : '\nNo patientContext beyond clinicalSummary.',
      '\nReturn only the JSON object as specified.',
    ].join('\n');

    const resolved = await resolveProviderAndModel('recovery-prediction');
    resolvedProvider = resolved.provider;
    const reply = await callAI(
      [{ role: 'user', content: userContent }],
      'recovery-prediction',
      RECOVERY_PREDICTION_PROMPT,
      resolved
    );

    let parsed: JsonObject;
    try {
      parsed = extractJson<JsonObject>(reply, JSON_OBJECT, {});
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] recovery-prediction JSON parse failed');
      throw new AiResponseError(502, { error: 'AI returned invalid JSON for recovery prediction', raw: reply.slice(0, 500) });
    }

    const min = Number(parsed.predicted_recovery_days_min);
    const max = Number(parsed.predicted_recovery_days_max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new AiResponseError(502, { error: 'AI recovery prediction missing numeric day range', raw: reply.slice(0, 500) });
    }
    const [rMin, rMax] = normalizeDayRange(min, max);
    const confidenceRaw = String(parsed.confidence || 'low').toLowerCase();

    return {
      predicted_recovery_days_min: rMin,
      predicted_recovery_days_max: rMax,
      confidence: ['high', 'medium', 'low'].includes(confidenceRaw) ? confidenceRaw : 'low',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      disclaimer: typeof parsed.disclaimer === 'string' ? parsed.disclaimer : '',
      provider: resolved.provider,
      model: resolved.model,
    };
  } catch (error) {
    if (error instanceof AiResponseError) throw error;
    logger.error({ err: error }, '[AI] recovery-prediction error');
    throw new AiResponseError(503, {
      error: 'Recovery prediction failed',
      hint:
        resolvedProvider === 'groq'
          ? 'Check GROQ_API_KEY and quota.'
          : 'Start Ollama (or your local OpenAI-compatible server) or set GROQ_API_KEY in backend/.env',
    });
  }
}

type SuggestMedicineInput = { diagnosis?: string; symptoms?: string; patientInfo?: string; language?: string };

/** Medication suggestions for a diagnosis / symptoms; Vietnamese unless `language` says otherwise. */
export async function suggestMedicine({ diagnosis, symptoms, patientInfo, language }: SuggestMedicineInput) {
  if (!diagnosis && !symptoms) {
    throw new BadRequestError('At least one of "diagnosis" or "symptoms" is required.');
  }
  const useVietnamese = String(language || 'vi').toLowerCase().startsWith('vi');
  const userMessage = useVietnamese
    ? `
Thông tin bệnh nhân: ${patientInfo || 'Chưa có'}
Chẩn đoán của bác sĩ: ${diagnosis || 'Chưa có'}
Triệu chứng / diễn biến: ${symptoms || 'Chưa có'}

Hãy gợi ý thuốc phù hợp. Mọi hướng dẫn "usage" và "note" phải bằng tiếng Việt.`
    : `
Patient Information: ${patientInfo || 'Not provided'}
Doctor's Diagnosis: ${diagnosis || 'Not provided'}
Patient Symptoms: ${symptoms || 'Not provided'}

Based on the above, suggest appropriate medications.`;

  try {
    const resolved = await resolveProviderAndModel('suggest-medicine');
    const reply = await callAI(
      [{ role: 'user', content: userMessage }],
      'suggest-medicine',
      useVietnamese ? MEDICINE_SUGGEST_PROMPT_VI : MEDICINE_SUGGEST_PROMPT_EN,
      resolved
    );
    let suggestions: unknown[] = [];
    try {
      suggestions = extractJson<unknown[]>(reply, JSON_ARRAY, []);
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] Failed to parse medicine suggestions JSON');
    }
    return { success: true, suggestions, raw: reply, provider: resolved.provider, model: resolved.model };
  } catch (error) {
    logger.error({ err: error }, '[AI] suggest-medicine error');
    throw new AiResponseError(500, { success: false, error: 'Failed to get medicine suggestions', suggestions: [] });
  }
}

type DoctorCandidate = { firstName?: string; lastName?: string; department?: string; room?: string };
type RecommendDoctorInput = {
  symptoms?: string;
  department?: string;
  preferredDate?: string;
  availableDoctors?: DoctorCandidate[];
};

/** Ranks `availableDoctors` for the patient's symptoms / department. */
export async function recommendDoctor({ symptoms, department, preferredDate, availableDoctors }: RecommendDoctorInput) {
  if (!symptoms && !department) {
    throw new BadRequestError('At least one of "symptoms" or "department" is required.');
  }
  const doctorListText = Array.isArray(availableDoctors)
    ? availableDoctors
        .map((d) => `- Dr. ${d.firstName || ''} ${d.lastName || ''} (${d.department || 'General'}, Room: ${d.room || 'N/A'})`)
        .join('\n')
    : 'No doctor list provided.';

  const prompt = `You are a hospital scheduling assistant. Based on the patient's needs, recommend the most suitable doctor.

Patient symptoms: ${symptoms || 'Not specified'}
Preferred department: ${department || 'Not specified'}
Preferred date: ${preferredDate || 'Not specified'}

Available doctors:
${doctorListText}

Respond with a JSON object:
{
  "recommendations": [
    {
      "doctorName": "Full name",
      "department": "Specialty",
      "reason": "Brief explanation why this doctor is suitable",
      "priority": 1
    }
  ],
  "generalAdvice": "Any scheduling advice"
}`;

  try {
    const resolved = await resolveProviderAndModel('recommend-doctor');
    const reply = await callAI(
      [{ role: 'user', content: prompt }],
      'recommend-doctor',
      'You are a hospital scheduling AI. You return structured JSON only.',
      resolved
    );
    let parsed: JsonObject = {};
    try {
      parsed = extractJson<JsonObject>(reply, JSON_OBJECT, {});
    } catch {
      /* keep {} — the raw reply is returned anyway */
    }
    return { success: true, ...parsed, raw: reply, provider: resolved.provider, model: resolved.model };
  } catch (error) {
    logger.error({ err: error }, '[AI] recommend-doctor error');
    throw new AiResponseError(500, { success: false, error: 'Failed to get doctor recommendations' });
  }
}
