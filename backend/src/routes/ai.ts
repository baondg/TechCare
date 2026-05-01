import { Router, Request, Response } from 'express';
const router = Router();
const sequelize = require('../common/database');
const defineSystemConfig = require('../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);
const { aiChatRateLimit, aiSymptomRateLimit } = require('../middleware/rateLimitMiddleware');

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
  apiKey: process.env.GROQ_API_KEY || '',
  model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  baseUrl: 'https://api.groq.com/openai/v1',
});

const getLocalLLMConfig = () => ({
  baseUrl: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434',
  model:   process.env.LOCAL_LLM_MODEL   || 'llama3',
  apiKey:  process.env.LOCAL_LLM_API_KEY || 'ollama',
});

function getActiveProvider(): 'groq' | 'local' {
  return process.env.GROQ_API_KEY ? 'groq' : 'local';
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
const MEDICINE_SUGGEST_PROMPT = `You are an expert clinical pharmacist AI assistant helping doctors prescribe medications.
Given a diagnosis and symptoms, suggest appropriate medications.

IMPORTANT: You must respond ONLY with a valid JSON array. No explanation, no markdown, no extra text.
Each item must have exactly these fields:
[
  {
    "name": "Medicine name (e.g. Paracetamol 500mg)",
    "quantity": "Recommended quantity (e.g. 20)",
    "unit": "One of: tablet, capsule, syrup, injection, drop, cream, ointment, powder, spray",
    "usage": "Dosage instructions (e.g. 1 tablet every 6 hours after meals)",
    "note": "Important notes or warnings"
  }
]

Suggest 3-6 medications including both causal treatment and symptomatic relief.
Always include standard dosages and common warnings.`;

const SYMPTOM_ANALYSIS_PROMPT = `You are a cautious clinical triage assistant for TechCare.
Given structured patient symptoms (name, severity, duration), respond ONLY with a single valid JSON object — no markdown fences, no extra text.

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
- If red-flag symptoms (e.g. chest pain, stroke signs), urge emergency care.`;

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

  console.log(`[AI] Calling Groq API with model "${config.model}"`);

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

  console.log(`[AI] Calling local LLM at ${url} with model "${model}"`);

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
  const modelConfig = await SystemConfig.findOne({ where: { key: 'aiModels' } });
  const defaultsConfig = await SystemConfig.findOne({ where: { key: 'aiDefaultModelByFeature' } });

  let models: Array<{ provider: string; modelId: string; featureScope: string; enabled: boolean }> = [];
  let defaults: Record<string, { provider: string; modelId: string }> = {};
  try {
    models = modelConfig?.value ? JSON.parse(modelConfig.value) : [];
  } catch (_error) {
    models = [];
  }
  try {
    defaults = defaultsConfig?.value ? JSON.parse(defaultsConfig.value) : {};
  } catch (_error) {
    defaults = {};
  }
  return { models: Array.isArray(models) ? models : [], defaults: defaults || {} };
};

const resolveProviderAndModel = async (feature: string) => {
  const fallbackProvider = getActiveProvider();
  const fallbackModel = fallbackProvider === 'groq' ? getGroqConfig().model : getLocalLLMConfig().model;
  const { models, defaults } = await loadAiModelRegistry();

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

  return { provider: fallbackProvider, model: fallbackModel };
};

async function callAI(messages: ChatMessage[], feature: string, systemPrompt?: string): Promise<string> {
  const { provider, model } = await resolveProviderAndModel(feature);
  if (provider === 'groq') {
    return callGroqAPI(messages, systemPrompt, model);
  }
  return callLocalLLM(messages, systemPrompt, model);
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/ai/chat — Health-check / info endpoint
 */
router.get('/chat', (_req: Request, res: Response) => {
  const provider = getActiveProvider();
  const config = provider === 'groq' ? getGroqConfig() : getLocalLLMConfig();
  res.json({
    status: 'ok',
    message: 'AI Chat API is running!',
    provider: provider === 'groq' ? 'Groq Cloud API' : 'Local LLM (OpenAI-compatible)',
    model: provider === 'groq' ? (config as any).model : (config as any).model,
    endpoints: {
      test: 'GET /api/ai/chat',
      chat: 'POST /api/ai/chat',
      suggestMedicine: 'POST /api/ai/suggest-medicine',
      recommendDoctor: 'POST /api/ai/recommend-doctor',
    },
    env: {
      GROQ_API_KEY: process.env.GROQ_API_KEY ? '***set***' : '(not set — using local LLM)',
      LOCAL_LLM_BASE_URL: getLocalLLMConfig().baseUrl,
      LOCAL_LLM_MODEL: getLocalLLMConfig().model,
    },
  });
});

/**
 * POST /api/ai/chat — Chat with AI
 */
router.post('/chat', aiChatRateLimit, async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request. "messages" array is required.',
      });
    }

    const resolved = await resolveProviderAndModel('chat');
    const reply = await callAI(messages, 'chat', systemPrompt);

    return res.json({
      message: reply,
      timestamp: new Date().toISOString(),
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    console.error('[AI] Error:', error?.message);

    const userMessage =
      (req.body?.messages as ChatMessage[] | undefined)
        ?.filter(m => m.role === 'user')
        ?.pop()?.content ?? '';

    const provider = getActiveProvider();
    return res.status(200).json({
      message: getFallbackResponse(userMessage),
      fallback: true,
      hint: provider === 'groq'
        ? `Groq API error: ${error?.message}`
        : `Local LLM unavailable. Start Ollama or set GROQ_API_KEY in backend/.env`,
    });
  }
});

/**
 * POST /api/ai/symptom-analysis
 * Used by appointmentController (patient symptom checker). No auth — only call from same backend.
 * Body: { symptoms: Array<{ name, severity, duration }> }
 */
router.post('/symptom-analysis', aiSymptomRateLimit, async (req: Request, res: Response) => {
  try {
    const symptoms = req.body?.symptoms;
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ error: 'symptoms array is required' });
    }

    const userContent = `Patient-reported symptoms (JSON):\n${JSON.stringify(symptoms, null, 2)}\n\nReturn only the JSON object as specified.`;
    const resolved = await resolveProviderAndModel('symptom-analysis');
    const reply = await callAI([{ role: 'user', content: userContent }], 'symptom-analysis', SYMPTOM_ANALYSIS_PROMPT);

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
    } catch (parseErr) {
      console.error('[AI] symptom-analysis JSON parse failed:', parseErr);
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

    return res.json({
      possible_conditions,
      recommended_action,
      suggested_medication_type,
      provider: resolved.provider,
      model: resolved.model,
    });
  } catch (error: any) {
    console.error('[AI] symptom-analysis error:', error?.message);
    return res.status(503).json({
      error: error?.message || 'Symptom analysis failed',
      hint:
        getActiveProvider() === 'groq'
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
router.post('/suggest-medicine', async (req: Request, res: Response) => {
  try {
    const { diagnosis, symptoms, patientInfo } = req.body;

    if (!diagnosis && !symptoms) {
      return res.status(400).json({
        error: 'At least one of "diagnosis" or "symptoms" is required.',
      });
    }

    const userMessage = `
Patient Information: ${patientInfo || 'Not provided'}
Doctor's Diagnosis: ${diagnosis || 'Not provided'}
Patient Symptoms: ${symptoms || 'Not provided'}

Based on the above, suggest appropriate medications.`;

    const reply = await callAI(
      [{ role: 'user', content: userMessage }],
      'suggest-medicine',
      MEDICINE_SUGGEST_PROMPT
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
      console.error('[AI] Failed to parse medicine suggestions JSON:', parseErr);
    }

    return res.json({
      success: true,
      suggestions,
      raw: reply,
      provider: (await resolveProviderAndModel('suggest-medicine')).provider,
    });
  } catch (error: any) {
    console.error('[AI] suggest-medicine error:', error?.message);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to get medicine suggestions',
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
router.post('/recommend-doctor', async (req: Request, res: Response) => {
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
      provider: (await resolveProviderAndModel('recommend-doctor')).provider,
    });
  } catch (error: any) {
    console.error('[AI] recommend-doctor error:', error?.message);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to get doctor recommendations',
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
