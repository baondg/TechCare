import { Router, Request, Response } from 'express';
import logger from '../common/logger';
import { config } from '../config/env';
import {
  callAI,
  ChatMessage,
  ChatRequest,
  getActiveProvider,
  getLocalLLMConfig,
  resolveChatExecutionModel,
  resolveProviderAndModel,
} from '../services/ai/llmClient';
import {
  getFallbackResponse,
  MEDICINE_SUGGEST_PROMPT_EN,
  MEDICINE_SUGGEST_PROMPT_VI,
  RECOVERY_PREDICTION_PROMPT,
  SYMPTOM_ANALYSIS_PROMPT,
} from '../services/ai/prompts';
const router = Router();
router.use((req: Request, _res: Response, next) => {
  logAiHttp(req);
  next();
});
const authenticateToken = require('../middleware/authMiddleware');
const { normalizeRoleFromCode } = require('../security/roleMapping');
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

export default router;
