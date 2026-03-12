import { Router, Request, Response } from 'express';

const router = Router();

// ============================================================
// Local LLM configuration (set in backend/.env)
//
// LOCAL_LLM_BASE_URL  – base URL of the OpenAI-compatible server
//                       Ollama  : http://localhost:11434
//                       LM Studio: http://localhost:1234
//                       LocalAI : http://localhost:8080
//
// LOCAL_LLM_MODEL     – model name to pass in the request
//                       Ollama examples : llama3, mistral, qwen2
//                       LM Studio       : use the model name shown in the UI
//
// LOCAL_LLM_API_KEY   – optional; most local servers don't need one;
//                       set to any non-empty string if the server requires it
// ============================================================
// Read lazily at request time so that any dotenv loading order issues
// do not cause these to freeze at their default values.
const getLocalLLMConfig = () => ({
  baseUrl: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434',
  model:   process.env.LOCAL_LLM_MODEL   || 'llama3',
  apiKey:  process.env.LOCAL_LLM_API_KEY || 'ollama',
});

// ============================================================
// Types
// ============================================================
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string; // optional override (e.g. used by symptom checker)
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
- Never diagnose conditions — provide general information only`;

// ============================================================
// Helper: call local LLM via OpenAI-compatible /v1/chat/completions
// ============================================================
async function callLocalLLM(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const { baseUrl, model, apiKey } = getLocalLLMConfig();
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPT },
      ...messages.filter(m => m.role !== 'system'), // avoid duplicate system msg
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
    throw new Error(
      `Local LLM error (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as any;

  // Standard OpenAI-compatible response shape
  const text: string | undefined =
    data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('Local LLM returned an empty response');
  }

  return text;
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/ai/chat
 * Health-check / info endpoint
 */
router.get('/chat', (_req: Request, res: Response) => {
  const { baseUrl, model } = getLocalLLMConfig();
  res.json({
    status: 'ok',
    message: 'AI Chat API is running!',
    provider: 'Local LLM (OpenAI-compatible)',
    model,
    baseUrl,
    usage:
      'Send POST request with { "messages": [{ "role": "user", "content": "your message" }] }',
    endpoints: {
      test: 'GET /api/ai/chat',
      chat: 'POST /api/ai/chat',
    },
  });
});

/**
 * POST /api/ai/chat
 * Send a message to the local LLM and return the response.
 *
 * Request body:
 *   { "messages": ChatMessage[] }
 *
 * Response:
 *   { "message": string, "timestamp": string }
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request. "messages" array is required.',
      });
    }

    const reply = await callLocalLLM(messages, systemPrompt);

    return res.json({
      message: reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[AI] Local LLM Error:', error?.message);

    // Friendly fallback so the UI stays functional even when the local model is offline
    const userMessage =
      (req.body?.messages as ChatMessage[] | undefined)
        ?.filter(m => m.role === 'user')
        ?.pop()?.content ?? '';

    // Return 200 so the browser doesn't log a console error – we still
    // include `fallback: true` so callers can detect the degraded state.
    const { baseUrl, model } = getLocalLLMConfig();
    return res.status(200).json({
      message: getFallbackResponse(userMessage),
      fallback: true,
      hint: `Local LLM unavailable at ${baseUrl} with model "${model}". Start Ollama / LM Studio or check that the model is loaded.`,
    });
  }
});

// ============================================================
// Rule-based fallback (only used when local LLM is offline)
// ============================================================
function getFallbackResponse(query: string): string {
  const q = query.toLowerCase();

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
