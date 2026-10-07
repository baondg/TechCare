/**
 * LLM provider access for the AI routes: Groq (when GROQ_API_KEY is set) or a local
 * OpenAI-compatible LLM (Ollama / LM Studio / LocalAI), plus model selection from the
 * admin-managed registry in SYSTEM_CONFIGURATION.
 */
import logger from '../../common/logger';
import { config } from '../../config/env';
import { SYSTEM_PROMPT } from './prompts';
const sequelize = require('../../common/database');
const defineSystemConfig = require('../../models/SystemConfig');
const SystemConfig = defineSystemConfig(sequelize);

// ============================================================
// AI Provider Configuration
//
// The system supports two providers:
// 1. Groq Cloud API  — set GROQ_API_KEY in .env
// 2. Local LLM       — Ollama / LM Studio / LocalAI
//
// If GROQ_API_KEY is set, Groq is used. Otherwise falls back to local LLM.
// ============================================================

export const getGroqConfig = () => ({
  apiKey: config.ai.groq.apiKey,
  model: config.ai.groq.model,
  baseUrl: 'https://api.groq.com/openai/v1',
});

export const getLocalLLMConfig = () => ({
  baseUrl: config.ai.localLlm.baseUrl,
  model:   config.ai.localLlm.model,
  apiKey:  config.ai.localLlm.apiKey,
});

export function getActiveProvider(): 'groq' | 'local' {
  return config.ai.groq.apiKey ? 'groq' : 'local';
}

export function getFeatureProviderOverride(feature: string): 'groq' | 'local' | null {
  const key = feature.toUpperCase().replace(/[^A-Z0-9]/g, '_').toLowerCase();
  const raw = String(config.ai.providerOverrides[key] || '').toLowerCase();
  if (raw === 'groq' || raw === 'local') return raw;
  return null;
}

export function getFeatureModelOverride(feature: string): string | null {
  const key = feature.toUpperCase().replace(/[^A-Z0-9]/g, '_').toLowerCase();
  const raw = String(config.ai.modelOverrides[key] || '');
  return raw || null;
}

// ============================================================
// Types
// ============================================================
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  /** From appointmentController: DB AI_MODEL.provider + version (API model id). */
  preferredModel?: { provider?: string; modelApiId?: string };
}

// ============================================================
// Helper: call Groq API
// ============================================================
export async function callGroqAPI(messages: ChatMessage[], systemPrompt?: string, overrideModel?: string): Promise<string> {
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
export async function callLocalLLM(messages: ChatMessage[], systemPrompt?: string, overrideModel?: string): Promise<string> {
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
export const loadAiModelRegistry = async () => {
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

export const resolveProviderAndModel = async (feature: string) => {
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

export type ResolvedModel = { provider: 'groq' | 'local'; model: string };

export async function callAI(
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

export function resolvePreferredChatModel(body: ChatRequest): ResolvedModel | null {
  const preferred = body?.preferredModel;
  if (!preferred || typeof preferred !== 'object') return null;
  const p = String(preferred.provider || '').toLowerCase();
  const modelApiId = String(preferred.modelApiId || '').trim();
  if (!modelApiId || (p !== 'groq' && p !== 'local')) return null;
  return { provider: p as 'groq' | 'local', model: modelApiId };
}

/** When AI_MODEL has provider but empty version, honor provider with env/registry default model for that provider. */
export async function resolveChatExecutionModel(body: ChatRequest): Promise<ResolvedModel> {
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
