import { Router, Request, Response } from 'express';
import logger from '../common/logger';
import { config } from '../config/env';
const router = Router();
router.use((req: Request, _res: Response, next) => {
  logAiHttp(req);
  next();
});
const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const authenticateToken = require('../middleware/authMiddleware');
const { normalizeRoleFromCode } = require('../security/roleMapping');
const SystemConfig = defineSystemConfig(sequelize);
const { aiChatRateLimit, aiSymptomRateLimit, aiRecoveryRateLimit } = require('../middleware/rateLimitMiddleware');
const { requireInternalApiSecret } = require('../middleware/requireInternalApiSecret');

function logAiHttp(req: Request) {
  const u = (req as { user?: { userId?: unknown; id?: unknown } }).user;
  const uid = u?.userId ?? u?.id ?? null;
  logger.info(
    { requestId: req.requestId ?? null, method: req.method, path: req.path, userId: uid },
    'ai.http'
  );
}

const requireAdmin = (req: any, res: Response, next: Function) => {
  if (!req.user || normalizeRoleFromCode(req.user.role) !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  return next();
};

const requireClinicalStaff = (req: any, res: Response, next: Function) => {
  const role = normalizeRoleFromCode(req.user?.role);
  if (role !== 'admin' && role !== 'doctor') {
    return res.status(403).json({ success: false, error: 'Doctor or admin access required' });
  }
  return next();
};

// ============================================================
// AI Provider Configuration
//
// The system supports two providers:
// 1. Groq Cloud API  — set GROQ_API_KEY in .env
// 2. Local LLM       — Ollama / LM Studio / LocalAI
//
// If GROQ_API_KEY is set, Groq is used. Otherwise falls back to local LLM.
// ============================================================

const getGroqConfig = () => ({
  apiKey: config.ai.groq.apiKey,
  model: config.ai.groq.model,
  baseUrl: 'https://api.groq.com/openai/v1',
});

const getLocalLLMConfig = () => ({
  baseUrl: config.ai.localLlm.baseUrl,
  model:   config.ai.localLlm.model,
  apiKey:  config.ai.localLlm.apiKey,
});

function getActiveProvider(): 'groq' | 'local' {
  return config.ai.groq.apiKey ? 'groq' : 'local';
}

function getFeatureProviderOverride(feature: string): 'groq' | 'local' | null {
  const key = feature.toUpperCase().replace(/[^A-Z0-9]/g, '_').toLowerCase();
  const raw = String(config.ai.providerOverrides[key] || '').toLowerCase();
  if (raw === 'groq' || raw === 'local') return raw;
  return null;
}

function getFeatureModelOverride(feature: string): string | null {
  const key = feature.toUpperCase().replace(/[^A-Z0-9]/g, '_').toLowerCase();
  const raw = String(config.ai.modelOverrides[key] || '');
  return raw || null;
}

// ============================================================
// Types
// ============================================================
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  /** From appointmentController: DB AI_MODEL.provider + version (API model id). */
  preferredModel?: { provider?: string; modelApiId?: string };
}

// ============================================================
// Medical-assistant system prompt
// ============================================================
const SYSTEM_PROMPT = `You are a helpful medical assistant for TechCare hospital.
You can help patients with:
- Medication information and reminders
- Appointment scheduling and information
- General health questions and wellness tips
- Post-treatment care instructions

Important guidelines:
- Always be empathetic and professional
- For serious medical concerns, always recommend consulting a doctor
- Keep responses concise but informative
- Use simple, easy-to-understand language
- Never diagnose conditions — provide general information only
- Reply in the same language the patient uses (e.g. Vietnamese or English).`;

// ============================================================
// Medicine suggestion system prompt
// ============================================================
const MEDICINE_SUGGEST_PROMPT_VI = `Bạn là dược sĩ lâm sàng hỗ trợ bác sĩ kê đơn thuốc tại Việt Nam.
Dựa trên chẩn đoán và triệu chứng (tiếng Việt), gợi ý thuốc phù hợp.

QUAN TRỌNG: Chỉ trả về một mảng JSON hợp lệ. Không giải thích, không markdown, không text thừa.
Mỗi phần tử phải có đúng các trường sau:
[
  {
    "name": "Tên thuốc (vd: Paracetamol 500mg hoặc tên thường dùng tại VN)",
    "quantity": "Số lượng (vd: 20)",
    "unit": "Một trong: tablet, capsule, syrup, injection, drop, cream, ointment, powder, spray",
    "usage": "Hướng dẫn cách dùng BẰNG TIẾNG VIỆT (vd: Uống 1 viên/lần, 2 lần/ngày, sau ăn)",
    "note": "Ghi chú / cảnh báo BẰNG TIẾNG VIỆT (có thể để rỗng nếu không cần)"
  }
]

Gợi ý 3–6 thuốc (điều trị nguyên nhân và triệu chứng).
Trường "usage" và "note" bắt buộc dùng tiếng Việt có dấu.`;

const MEDICINE_SUGGEST_PROMPT_EN = `You are an expert clinical pharmacist AI assistant helping doctors prescribe medications.
Given a diagnosis and symptoms, suggest appropriate medications.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no extra text.
Each item must have exactly these fields:
[
  {
    "name": "Medicine name (e.g. Paracetamol 500mg)",
    "quantity": "Recommended quantity (e.g. 20)",
    "unit": "One of: tablet, capsule, syrup, injection, drop, cream, ointment, powder, spray",
    "usage": "Dosage instructions",
    "note": "Important notes or warnings"
  }
]

Suggest 3-6 medications including both causal treatment and symptomatic relief.`;

const SYMPTOM_ANALYSIS_PROMPT = `You are a cautious clinical triage assistant for TechCare.
You receive (1) structured patient-reported symptoms (name, severity, duration) and (2) optional patientContext: demographics (sex, age), latest vitals from MEDICAL_RECORD, allergies, medical history, and recent medications.

Symptom names are pre-normalized: preset symptoms use canonical English labels (e.g. Fever, Cough); free-text symptoms are trimmed patient wording.

Use patientContext when present to refine differential reasoning and urgency (e.g. age, abnormal vitals, allergies, comorbidities, interacting meds). If a field is missing, do not assume a value.

Respond ONLY with a single valid JSON object — no markdown fences, no extra text.

Schema:
{
  "possible_conditions": [
    { "disease": "short condition name", "probability": "low" | "medium" | "high", "reason": "one sentence" }
  ],
  "recommended_action": "what the patient should do next (self-care vs see a doctor)",
  "suggested_medication_type": ["broad categories only, e.g. pain reliever — not brand names"]
}

Rules:
- 1 to 4 items in possible_conditions.
- Never claim a definitive diagnosis; use cautious language.
- If red-flag symptoms (e.g. chest pain, stroke signs) or dangerous vital patterns when data is present, urge emergency care.
- Do not invent vitals or history not supplied in patientContext.`;

const RECOVERY_PREDICTION_PROMPT = `You are a cautious clinical support assistant for TechCare estimating typical recovery timeframes for patient education only.

You receive JSON payloads:
- clinicalSummary: may include latest ICD-based diagnosis label, chief complaint from last visit, and recent medication names (partial data is common).
- patientContext: optional demographics, vitals, allergies, chronic conditions, etc.

Respond ONLY with a single valid JSON object — no markdown fences, no extra text.

Schema:
{
  "predicted_recovery_days_min": <integer 1-365>,
  "predicted_recovery_days_max": <integer 1-365, >= min>,
  "confidence": "low" | "medium" | "high",
  "note": "<one or two short sentences; Vietnamese if clinical text is Vietnamese, else English>",
  "disclaimer": "<one sentence: not a substitute for a clinician; follow doctor instructions>"
}

Rules:
- Never claim certainty or a formal diagnosis; this is an approximate range for self-care expectations.
- If diagnosis or clinical data is missing or vague, use a wide range and set confidence to "low".
- If patientContext suggests higher risk (e.g. older age, significant comorbidity, abnormal vitals when provided), widen the range or lower confidence.
- Do not invent specific diagnoses not supported by clinicalSummary; prefer conservative estimates.`;

// ============================================================
// Helper: call Groq API
// ============================================================
async function callGroqAPI(messages: ChatMessage[], systemPrompt?: string, overrideModel?: string): Promise<string> {
  const config = getGroqConfig();
  const url = `${config.baseUrl}/chat/completions`;

  const body = {
    model: overrideModel || config.model,
    messages: [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPT },
      ...messages.filter(m => m.role !== 'system'),
    ],
    temperature: 0.7,
    max_tokens: 1024,
    stream: false,
  };

  logger.info(`[AI] Calling Groq API with model "${config.model}"`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text: string | undefined = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('Groq API returned an empty response');
  }

  return text;
}

// ============================================================
// Helper: call local LLM via OpenAI-compatible /v1/chat/completions
// ============================================================
async function callLocalLLM(messages: ChatMessage[], systemPrompt?: string, overrideModel?: string): Promise<string> {
  const { baseUrl, model, apiKey } = getLocalLLMConfig();
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const body = {
    model: overrideModel || model,
    messages: [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPT },
      ...messages.filter(m => m.role !== 'system'),
    ],
    temperature: 0.7,
    max_tokens: 1024,
    stream: false,
  };

  logger.info(`[AI] Calling local LLM at ${url} with model "${model}"`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text: string | undefined = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('Local LLM returned an empty response');
  }

  return text;
}

// ============================================================
// Unified AI call — auto-selects provider
// ============================================================
const loadAiModelRegistry = async () => {
  let modelConfig: any = null;
  let catalogConfig: any = null;
  let defaultsConfig: any = null;
  try {
    catalogConfig = await SystemConfig.findOne({ where: { key: 'aiModelCatalog' } });
    modelConfig = await SystemConfig.findOne({ where: { key: 'aiModels' } });
    defaultsConfig = await SystemConfig.findOne({ where: { key: 'aiDefaultModelByFeature' } });
  } catch (error: any) {
    // Some deployments still use a legacy SYSTEM_CONFIGURATION schema without "key"/"value".
    // Fallback to env-based model resolution instead of failing AI endpoints.
    if (error?.original?.code === 'ER_BAD_FIELD_ERROR') {
      logger.warn('[AI] SYSTEM_CONFIGURATION key/value columns unavailable. Using env/default AI model config.');
      return { catalog: [], models: [], defaults: {} };
    }
    throw error;
  }

  let catalog: Array<{ provider: string; modelId: string; label?: string; enabled?: boolean }> = [];
  let models: Array<{ provider: string; modelId: string; featureScope: string; enabled: boolean }> = [];
  let defaults: Record<string, { provider: string; modelId: string }> = {};
  try {
    catalog = catalogConfig?.value ? JSON.parse(catalogConfig.value) : [];
  } catch {
    catalog = [];
  }
  try {
    models = modelConfig?.value ? JSON.parse(modelConfig.value) : [];
  } catch {
    models = [];
  }
  try {
    defaults = defaultsConfig?.value ? JSON.parse(defaultsConfig.value) : {};
  } catch {
    defaults = {};
  }
  return {
    catalog: Array.isArray(catalog) ? catalog : [],
    models: Array.isArray(models) ? models : [],
    defaults: defaults || {},
  };
};

const resolveProviderAndModel = async (feature: string) => {
  const overrideProvider = getFeatureProviderOverride(feature);
  const overrideModel = getFeatureModelOverride(feature);
  if (overrideProvider) {
    const providerModel =
      overrideProvider === 'groq'
        ? getGroqConfig().model
        : getLocalLLMConfig().model;
    return { provider: overrideProvider, model: overrideModel || providerModel };
  }

  const fallbackProvider = getActiveProvider();
  const fallbackModel = fallbackProvider === 'groq' ? getGroqConfig().model : getLocalLLMConfig().model;
  const { catalog, models, defaults } = await loadAiModelRegistry();

  const defaultCandidate = defaults?.[feature];
  if (defaultCandidate?.provider && defaultCandidate?.modelId) {
    const match = models.find(
      (m) =>
        m.provider === defaultCandidate.provider &&
        m.modelId === defaultCandidate.modelId &&
        m.featureScope === feature &&
        m.enabled === true
    );
    if (match) return { provider: match.provider as 'groq' | 'local', model: match.modelId };
  }

  const firstEnabled = models.find((m) => m.featureScope === feature && m.enabled === true);
  if (firstEnabled) {
    return { provider: firstEnabled.provider as 'groq' | 'local', model: firstEnabled.modelId };
  }

  const firstCatalogByProvider = catalog.find(
    (m) => m.provider === fallbackProvider && (m.enabled === undefined || m.enabled === true)
  );
  if (firstCatalogByProvider?.modelId) {
    return { provider: fallbackProvider, model: String(firstCatalogByProvider.modelId) };
  }

  return { provider: fallbackProvider, model: fallbackModel };
};

type ResolvedModel = { provider: 'groq' | 'local'; model: string };

async function callAI(
  messages: ChatMessage[],
  feature: string,
  systemPrompt?: string,
  resolvedOverride?: ResolvedModel
): Promise<string> {
  const { provider, model } = resolvedOverride || (await resolveProviderAndModel(feature));
  if (provider === 'groq') {
    return callGroqAPI(messages, systemPrompt, model);
  }
  return callLocalLLM(messages, systemPrompt, model);
}

function resolvePreferredChatModel(body: ChatRequest): ResolvedModel | null {
  const preferred = body?.preferredModel;
  if (!preferred || typeof preferred !== 'object') return null;
  const p = String(preferred.provider || '').toLowerCase();
  const modelApiId = String(preferred.modelApiId || '').trim();
  if (!modelApiId || (p !== 'groq' && p !== 'local')) return null;
  return { provider: p as 'groq' | 'local', model: modelApiId };
}

/** When AI_MODEL has provider but empty version, honor provider with env/registry default model for that provider. */
async function resolveChatExecutionModel(body: ChatRequest): Promise<ResolvedModel> {
  const direct = resolvePreferredChatModel(body);
  if (direct) return direct;

  const reg = await resolveProviderAndModel('chat');
  const pref = body?.preferredModel;
  if (!pref || typeof pref !== 'object') return reg;

  const p = String(pref.provider || '').toLowerCase();
  if (p !== 'groq' && p !== 'local') return reg;

  if (p === reg.provider) return reg;

  const envModel = getFeatureModelOverride('chat');
  if (p === 'groq') {
    return { provider: 'groq', model: envModel || getGroqConfig().model };
  }
  return { provider: 'local', model: envModel || getLocalLLMConfig().model };
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/ai/chat — Health-check / info endpoint
 */
router.get('/chat', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  const resolved = await resolveProviderAndModel('chat');
  res.json({
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
  });
});

/**
 * POST /api/ai/chat — Chat with AI (server-to-server; requires INTERNAL_API_SECRET in production)
 */
router.post('/chat', requireInternalApiSecret, aiChatRateLimit, async (req: Request, res: Response) => {
  try {
    const body = req.body as ChatRequest;
    const { messages, systemPrompt } = body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request. "messages" array is required.',
      });
    }

    const resolved = await resolveChatExecutionModel(body);
    const reply = await callAI(messages, 'chat', systemPrompt, resolved);

    return res.json({
      message: reply,
      timestamp: new Date().toISOString(),
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[AI] Error');

    const userMessage =
      (req.body?.messages as ChatMessage[] | undefined)
        ?.filter(m => m.role === 'user')
        ?.pop()?.content ?? '';

    const provider = getActiveProvider();
    return res.status(200).json({
      message: getFallbackResponse(userMessage),
      fallback: true,
      hint: provider === 'groq'
        ? 'Groq API unavailable (details in server logs)'
        : `Local LLM unavailable. Start Ollama or set GROQ_API_KEY in backend/.env`,
    });
  }
});

/**
 * POST /api/ai/symptom-analysis
 * Used by appointmentController (patient symptom checker). Requires INTERNAL_API_SECRET in production.
 * Body: { symptoms: Array<{ name, severity, duration }>, patientContext?: object }
 */
router.post('/symptom-analysis', requireInternalApiSecret, aiSymptomRateLimit, async (req: Request, res: Response) => {
  const symptoms = req.body?.symptoms;
  try {
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ error: 'symptoms array is required' });
    }

    const rawContext = req.body?.patientContext;
    const patientContext =
      rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext) ? rawContext : null;

    const userContent = [
      'Patient-reported symptoms (JSON):',
      JSON.stringify(symptoms, null, 2),
      patientContext && Object.keys(patientContext).length
        ? `\nLatest patient profile / vitals / history (JSON; may be partial):\n${JSON.stringify(patientContext, null, 2)}`
        : '\nNo structured patient profile/vitals were provided beyond symptoms.',
      '\nReturn only the JSON object as specified.',
    ].join('\n');
    const resolved = await resolveProviderAndModel('symptom-analysis');
    if (resolved.provider !== 'groq') {
      return res.status(503).json({
        error: 'AI symptom analysis requires Groq API',
        hint: 'Set a valid GROQ_API_KEY in backend/.env (local LLM is not used for symptom analysis).',
      });
    }
    const reply = await callAI([{ role: 'user', content: userContent }], 'symptom-analysis', SYMPTOM_ANALYSIS_PROMPT, resolved);

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] symptom-analysis JSON parse failed');
      return res.status(502).json({
        error: 'AI returned invalid JSON for symptom analysis',
        raw: reply.slice(0, 500),
      });
    }

    const possible_conditions = Array.isArray(parsed.possible_conditions) ? parsed.possible_conditions : [];
    const recommended_action =
      typeof parsed.recommended_action === 'string'
        ? parsed.recommended_action
        : 'Please consult a healthcare professional.';
    const suggested_medication_type = Array.isArray(parsed.suggested_medication_type)
      ? parsed.suggested_medication_type
      : [];

    if (possible_conditions.length === 0) {
      return res.status(502).json({
        error: 'AI returned no symptom analysis results',
        hint: 'Check GROQ_API_KEY and quota, then try again.',
      });
    }

    return res.json({
      possible_conditions,
      recommended_action,
      suggested_medication_type,
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[AI] symptom-analysis error');
    return res.status(503).json({
      error: 'Symptom analysis failed',
      hint: 'Check GROQ_API_KEY is valid in backend/.env, then try again.',
    });
  }
});

/**
 * POST /api/ai/recovery-prediction
 * Internal: appointmentController. Requires INTERNAL_API_SECRET in production.
 * Body: { clinicalSummary?: object, patientContext?: object }
 */
router.post('/recovery-prediction', requireInternalApiSecret, aiRecoveryRateLimit, async (req: Request, res: Response) => {
  let resolvedProvider: 'groq' | 'local' = getActiveProvider();
  try {
    const rawClinical = req.body?.clinicalSummary;
    const rawContext = req.body?.patientContext;
    const clinicalSummary =
      rawClinical && typeof rawClinical === 'object' && !Array.isArray(rawClinical) ? rawClinical : {};
    const patientContext =
      rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext) ? rawContext : {};

    const userContent = [
      'clinicalSummary (JSON):',
      JSON.stringify(clinicalSummary, null, 2),
      Object.keys(patientContext).length
        ? `\npatientContext (JSON; may be partial):\n${JSON.stringify(patientContext, null, 2)}`
        : '\nNo patientContext beyond clinicalSummary.',
      '\nReturn only the JSON object as specified.',
    ].join('\n');

    const resolved = await resolveProviderAndModel('recovery-prediction');
    resolvedProvider = resolved.provider;
    const reply = await callAI(
      [{ role: 'user', content: userContent }],
      'recovery-prediction',
      RECOVERY_PREDICTION_PROMPT
    );

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] recovery-prediction JSON parse failed');
      return res.status(502).json({
        error: 'AI returned invalid JSON for recovery prediction',
        raw: reply.slice(0, 500),
      });
    }

    const predicted_recovery_days_min = Number(parsed.predicted_recovery_days_min);
    const predicted_recovery_days_max = Number(parsed.predicted_recovery_days_max);
    const confidenceRaw = String(parsed.confidence || 'low').toLowerCase();
    const confidence =
      confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
        ? confidenceRaw
        : 'low';
    const note = typeof parsed.note === 'string' ? parsed.note : '';
    const disclaimer = typeof parsed.disclaimer === 'string' ? parsed.disclaimer : '';

    if (
      !Number.isFinite(predicted_recovery_days_min) ||
      !Number.isFinite(predicted_recovery_days_max)
    ) {
      return res.status(502).json({
        error: 'AI recovery prediction missing numeric day range',
        raw: reply.slice(0, 500),
      });
    }

    let rMin = Math.round(predicted_recovery_days_min);
    let rMax = Math.round(predicted_recovery_days_max);
    if (rMin > rMax) {
      const t = rMin;
      rMin = rMax;
      rMax = t;
    }
    rMin = Math.max(1, Math.min(365, rMin));
    rMax = Math.max(1, Math.min(365, rMax));
    if (rMin > rMax) {
      const t = rMin;
      rMin = rMax;
      rMax = t;
    }

    return res.json({
      predicted_recovery_days_min: rMin,
      predicted_recovery_days_max: rMax,
      confidence,
      note,
      disclaimer,
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[AI] recovery-prediction error');
    return res.status(503).json({
      error: 'Recovery prediction failed',
      hint:
        resolvedProvider === 'groq'
          ? 'Check GROQ_API_KEY and quota.'
          : 'Start Ollama (or your local OpenAI-compatible server) or set GROQ_API_KEY in backend/.env',
    });
  }
});

/**
 * POST /api/ai/suggest-medicine
 * Used by doctors to get AI-powered medication suggestions.
 *
 * Body: { diagnosis: string, symptoms: string, patientInfo?: string }
 * Response: { suggestions: Medication[], raw: string }
 */
router.post('/suggest-medicine', authenticateToken, requireClinicalStaff, async (req: Request, res: Response) => {
  try {
    const { diagnosis, symptoms, patientInfo, language } = req.body;
    const useVietnamese = String(language || 'vi').toLowerCase().startsWith('vi');

    if (!diagnosis && !symptoms) {
      return res.status(400).json({
        error: 'At least one of "diagnosis" or "symptoms" is required.',
      });
    }

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

    const resolved = await resolveProviderAndModel('suggest-medicine');
    const reply = await callAI(
      [{ role: 'user', content: userMessage }],
      'suggest-medicine',
      useVietnamese ? MEDICINE_SUGGEST_PROMPT_VI : MEDICINE_SUGGEST_PROMPT_EN
    );

    // Parse JSON from reply
    let suggestions: any[] = [];
    try {
      // Try to extract JSON array from the reply
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      logger.error({ err: parseErr }, '[AI] Failed to parse medicine suggestions JSON');
    }

    return res.json({
      success: true,
      suggestions,
      raw: reply,
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[AI] suggest-medicine error');
    return res.status(500).json({
      success: false,
      error: 'Failed to get medicine suggestions',
      suggestions: [],
    });
  }
});

/**
 * POST /api/ai/recommend-doctor
 * AI-powered doctor recommendation based on patient needs and availability.
 *
 * Body: { symptoms: string, department?: string, preferredDate?: string }
 */
router.post('/recommend-doctor', authenticateToken, requireClinicalStaff, async (req: Request, res: Response) => {
  try {
    const { symptoms, department, preferredDate, availableDoctors } = req.body;

    if (!symptoms && !department) {
      return res.status(400).json({
        error: 'At least one of "symptoms" or "department" is required.',
      });
    }

    const doctorListText = Array.isArray(availableDoctors)
      ? availableDoctors.map((d: any) =>
        `- Dr. ${d.firstName || ''} ${d.lastName || ''} (${d.department || 'General'}, Room: ${d.room || 'N/A'})`
      ).join('\n')
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

    const resolved = await resolveProviderAndModel('recommend-doctor');
    const reply = await callAI(
      [{ role: 'user', content: prompt }],
      'recommend-doctor',
      'You are a hospital scheduling AI. You return structured JSON only.'
    );

    let parsed: any = {};
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch { /* ignore */ }

    return res.json({
      success: true,
      ...parsed,
      raw: reply,
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[AI] recommend-doctor error');
    return res.status(500).json({
      success: false,
      error: 'Failed to get doctor recommendations',
    });
  }
});

// ============================================================
// Rule-based fallback (only used when AI is offline)
// ============================================================
function getFallbackResponse(query: string): string {
  const q = query.toLowerCase();

  if (
    q.includes('chóng mặt') ||
    q.includes('chong mat') ||
    q.includes('dizziness') ||
    q.includes('vertigo') ||
    q.includes('deadlift')
  ) {
    return (
      'Dizziness during heavy lifting can be from breath-holding, dehydration, low blood sugar, or blood-pressure changes. ' +
      'Stop the set, sit down, hydrate, and rest. If you have severe headache, vision changes, weakness, chest pain, fainting, or symptoms persist, seek urgent medical care. ' +
      'For personalized advice, please speak with a clinician or book a visit in TechCare.'
    );
  }
  if (q.includes('medication') || q.includes('medicine') || q.includes('drug') || q.includes('pill')) {
    return "I can help with medication information — dosages, schedules, side effects, and refill reminders. What would you like to know?";
  }
  if (q.includes('appointment') || q.includes('schedule') || q.includes('booking') || q.includes('visit')) {
    return "I can assist with appointments: viewing upcoming visits, booking new ones, or rescheduling. What would you like to do?";
  }
  if (q.includes('symptom') || q.includes('pain') || q.includes('sick') || q.includes('hurt') || q.includes('feel')) {
    return "I'm sorry to hear you're not feeling well. Please consult a healthcare professional for proper diagnosis. Would you like to schedule an urgent appointment?";
  }
  if (q.includes('result') || q.includes('lab') || q.includes('test')) {
    return "Lab results are typically available within 2–3 business days. Would you like to check the patient portal or schedule a follow-up?";
  }
  if (q.includes('bill') || q.includes('payment') || q.includes('insurance')) {
    return "For billing questions, please contact our billing department at (555) 123-4567, Mon–Fri 8AM–5PM.";
  }
  return "I'm here to help with your healthcare needs — medications, appointments, health questions, and more. How can I assist you today?";
}

export default router;
