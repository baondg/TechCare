/**
 * Single source of truth for environment configuration.
 *
 * Every env var the backend reads is declared, parsed and validated here once, at import time.
 * An invalid value (e.g. DB_PORT=abc) or a missing production requirement throws immediately,
 * so a misconfigured deploy fails at startup instead of on the first request that needs it.
 *
 * Modules read `config.<group>.<key>`; do not read `process.env` elsewhere in src/
 * (ESLint enforces this). Exceptions: common/logger.ts (LOG_LEVEL, must not depend on config).
 *
 * Parsing deliberately preserves the historical semantics of each variable
 * (e.g. flags that only accept '1' vs flags that accept true/yes/on).
 */
import dotenv from 'dotenv';
import { z } from 'zod';

// Idempotent and never overrides real env vars; makes config usable from any entry point.
dotenv.config();

const env = process.env;

// ─── value parsers ───────────────────────────────────────────────────────────

/** '1' | 'true' | 'yes' | 'on' → true, '0' | 'false' | 'no' | 'off' → false, else fallback. */
function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  const s = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

/** Trimmed string, '' when unset. */
function str(value: string | undefined): string {
  return String(value ?? '').trim();
}

/** Optional number: unset/'' → fallback; otherwise must be a finite number within bounds. */
function num(name: string, opts: { fallback: number; min?: number; max?: number; int?: boolean }) {
  let schema = z.number({ error: `${name} must be a number` });
  if (opts.int) schema = schema.int({ error: `${name} must be an integer` });
  if (opts.min !== undefined) schema = schema.min(opts.min, { error: `${name} must be >= ${opts.min}` });
  if (opts.max !== undefined) schema = schema.max(opts.max, { error: `${name} must be <= ${opts.max}` });
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? opts.fallback : Number(v)))
    .pipe(schema);
}

const ENCRYPTION_KEY_BYTES = 32;

// ─── schema ──────────────────────────────────────────────────────────────────

const schema = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: num('PORT', { fallback: 3000, min: 1, max: 65535, int: true }),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    AUTO_SYNC_DB: z.string().optional(),

    // auth
    JWT_SECRET: z.string().optional(),
    AUTH_REFRESH_COOKIE_SAMESITE: z.string().optional(),
    AUTH_REFRESH_COOKIE_SECURE: z.string().optional(),
    DEFAULT_ACCOUNT_PASSWORD: z.string().optional(),
    DEMO_ACCOUNT_PASSWORD: z.string().optional(),
    INTERNAL_API_SECRET: z.string().optional(),
    IMAGE_ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine((v) => !str(v) || Buffer.from(str(v), 'base64').length === ENCRYPTION_KEY_BYTES, {
        error: `IMAGE_ENCRYPTION_KEY must be ${ENCRYPTION_KEY_BYTES} bytes, base64-encoded (openssl rand -base64 32)`,
      }),

    // database
    DB_HOST: z.string().optional(),
    DB_PORT: num('DB_PORT', { fallback: 3306, min: 1, max: 65535, int: true }),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    CLOUDSQL_INSTANCE_CONNECTION_NAME: z.string().optional(),
    INSTANCE_CONNECTION_NAME: z.string().optional(),
    CLOUD_SQL_CONNECTION_NAME: z.string().optional(),
    DB_USE_SSL: z.string().optional(),
    DB_SSL_REJECT_UNAUTHORIZED: z.string().optional(),
    DB_SSL_CA_PATH: z.string().optional(),
    DB_SSL_CA_FILE: z.string().optional(),
    DB_SSL_CA: z.string().optional(),
    DB_POOL_MAX: num('DB_POOL_MAX', { fallback: 30, min: 1, int: true }),
    DB_POOL_MIN: num('DB_POOL_MIN', { fallback: 0, min: 0, int: true }),
    DB_POOL_ACQUIRE_MS: num('DB_POOL_ACQUIRE_MS', { fallback: 60000, min: 0 }),
    DB_POOL_IDLE_MS: num('DB_POOL_IDLE_MS', { fallback: 10000, min: 0 }),

    // redis / caching
    REDIS_URL: z.string().optional(),
    REDIS_CONNECT_TIMEOUT_MS: num('REDIS_CONNECT_TIMEOUT_MS', { fallback: 1500, min: 0 }),
    ENABLE_PATIENT_RECORD_CACHE: z.string().optional(),
    PATIENT_RECORD_CACHE_TTL_SECONDS: num('PATIENT_RECORD_CACHE_TTL_SECONDS', { fallback: 30, min: 0 }),
    APPOINTMENTS_LIST_CACHE_TTL_SECONDS: num('APPOINTMENTS_LIST_CACHE_TTL_SECONDS', { fallback: 5, min: 0 }),
    RECOVERY_PREDICTION_CACHE_HOURS: num('RECOVERY_PREDICTION_CACHE_HOURS', { fallback: 24, min: 0 }),
    PROFILE_HOTPATHS: z.string().optional(),

    // rate limiting
    BENCHMARK_RATE_LIMIT_BYPASS: z.string().optional(),
    ENABLE_DISTRIBUTED_RATE_LIMIT: z.string().optional(),
    REQUIRE_REDIS_FOR_DISTRIBUTED_RATE_LIMIT: z.string().optional(),
    RATE_LIMIT_RELAXED: z.string().optional(),
    RATE_LIMIT_POLICY_CACHE_MS: num('RATE_LIMIT_POLICY_CACHE_MS', { fallback: 30000, min: 0 }),

    // clinic / schedulers
    CLINIC_TIMEZONE: z.string().optional(),
    CLINIC_TZ_OFFSET: z.string().optional(),
    APPOINTMENT_REMINDER_HOUR: num('APPOINTMENT_REMINDER_HOUR', { fallback: 8, min: 0, max: 23, int: true }),
    DISABLE_APPOINTMENT_REMINDERS: z.string().optional(),
    DISABLE_MEDICATION_REMINDERS: z.string().optional(),

    // AI
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().optional(),
    LOCAL_LLM_BASE_URL: z.string().optional(),
    LOCAL_LLM_MODEL: z.string().optional(),
    LOCAL_LLM_API_KEY: z.string().optional(),
    BACKEND_INTERNAL_URL: z.string().optional(),
    MEDAI_CHAT_ENDPOINT: z.string().optional(),
    MEDAI_SYMPTOM_ENDPOINT: z.string().optional(),
    MEDAI_RECOVERY_ENDPOINT: z.string().optional(),

    // e-prescription (Bộ Y tế) facility identity
    BYT_PRESCRIPTION_TYPE: z.string().optional(),
    BYT_FACILITY_CODE: z.string().optional(),
    BYT_FACILITY_PHONE: z.string().optional(),
    BYT_FACILITY_NAME: z.string().optional(),
    BYT_FACILITY_ADDRESS: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
    for (const key of ['JWT_SECRET', 'DB_NAME', 'DB_USER'] as const) {
      if (!str(e[key])) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
  });

function parseEnv() {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Keys like PREFIX_<NAME>=value → { <name lowercased>: value } (dynamic per-feature/per-scope overrides). */
function collectByPattern(pattern: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const m = pattern.exec(key);
    if (m?.[1] && str(value)) out[m[1].toLowerCase()] = str(value);
  }
  return out;
}

const e = parseEnv();
const nodeEnv = e.NODE_ENV;
const port = e.PORT;
const internalApiBase = str(e.BACKEND_INTERNAL_URL) || `http://127.0.0.1:${port}`;
const bytType = str(e.BYT_PRESCRIPTION_TYPE || 'C').toUpperCase();
const bytFacilityAddress = str(e.BYT_FACILITY_ADDRESS || '268 Lý Thường Kiệt, phường Diên Hồng, Hồ Chí Minh');

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',

  server: {
    port,
    corsAllowedOrigins: (e.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    autoSyncDb: e.AUTO_SYNC_DB === '1' || e.AUTO_SYNC_DB === 'true',
  },

  auth: {
    /** '' when unset — see security/jwtConfig for the dev fallback. */
    jwtSecret: str(e.JWT_SECRET),
    /** Raw lowercased value; validated by the auth controller. */
    refreshCookieSameSite: str(e.AUTH_REFRESH_COOKIE_SAMESITE).toLowerCase(),
    /** undefined when unset (controller then derives it from NODE_ENV). */
    refreshCookieSecure:
      e.AUTH_REFRESH_COOKIE_SECURE === undefined ? undefined : e.AUTH_REFRESH_COOKIE_SECURE.toLowerCase() === 'true',
    /** Initial password for admin-created accounts; creation is refused without it (accountService). */
    defaultAccountPassword: e.DEFAULT_ACCOUNT_PASSWORD || e.DEMO_ACCOUNT_PASSWORD || '',
    internalApiSecret: str(e.INTERNAL_API_SECRET),
    imageEncryptionKey: str(e.IMAGE_ENCRYPTION_KEY),
  },

  db: {
    name: e.DB_NAME,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    host: e.DB_HOST || 'localhost',
    port: e.DB_PORT,
    instanceConnectionName:
      e.CLOUDSQL_INSTANCE_CONNECTION_NAME || e.INSTANCE_CONNECTION_NAME || e.CLOUD_SQL_CONNECTION_NAME || '',
    useSsl: parseBool(e.DB_USE_SSL, false),
    sslRejectUnauthorized: parseBool(e.DB_SSL_REJECT_UNAUTHORIZED, true),
    sslCaPath: e.DB_SSL_CA_PATH || e.DB_SSL_CA_FILE || '',
    sslCaInline: e.DB_SSL_CA || '',
    pool: {
      max: e.DB_POOL_MAX,
      min: e.DB_POOL_MIN,
      acquire: e.DB_POOL_ACQUIRE_MS,
      idle: e.DB_POOL_IDLE_MS,
    },
  },

  redis: {
    /** '' when unset; each consumer applies its own default. */
    url: str(e.REDIS_URL),
    connectTimeoutMs: e.REDIS_CONNECT_TIMEOUT_MS,
  },

  cache: {
    patientRecordRedisEnabled: e.ENABLE_PATIENT_RECORD_CACHE === '1',
    patientRecordTtlSeconds: e.PATIENT_RECORD_CACHE_TTL_SECONDS,
    appointmentsListTtlSeconds: e.APPOINTMENTS_LIST_CACHE_TTL_SECONDS,
    recoveryPredictionHours: e.RECOVERY_PREDICTION_CACHE_HOURS,
  },

  profileHotpaths: e.PROFILE_HOTPATHS === '1',

  rateLimit: {
    benchmarkBypass: parseBool(e.BENCHMARK_RATE_LIMIT_BYPASS, false),
    distributed: parseBool(e.ENABLE_DISTRIBUTED_RATE_LIMIT, false),
    requireRedisForDistributed: parseBool(e.REQUIRE_REDIS_FOR_DISTRIBUTED_RATE_LIMIT, false),
    relaxed: parseBool(e.RATE_LIMIT_RELAXED, false),
    policyCacheMs: e.RATE_LIMIT_POLICY_CACHE_MS,
    /** `<SCOPE>_RATE_LIMIT_MAX` / `<SCOPE>_RATE_LIMIT_WINDOW_SECONDS`, keyed by lowercased scope. */
    maxOverrides: collectByPattern(/^(\w+?)_RATE_LIMIT_MAX$/),
    windowSecondsOverrides: collectByPattern(/^(\w+?)_RATE_LIMIT_WINDOW_SECONDS$/),
  },

  clinic: {
    timezone: str(e.CLINIC_TIMEZONE) || 'Asia/Ho_Chi_Minh',
    tzOffset: str(e.CLINIC_TZ_OFFSET) || '+07:00',
  },

  reminders: {
    appointmentHour: e.APPOINTMENT_REMINDER_HOUR,
    appointmentDisabled: e.DISABLE_APPOINTMENT_REMINDERS === '1',
    medicationDisabled: e.DISABLE_MEDICATION_REMINDERS === '1',
  },

  ai: {
    groq: {
      apiKey: e.GROQ_API_KEY || '',
      model: e.GROQ_MODEL || 'llama-3.1-8b-instant',
    },
    localLlm: {
      baseUrl: e.LOCAL_LLM_BASE_URL || 'http://localhost:11434',
      model: e.LOCAL_LLM_MODEL || 'llama3',
      apiKey: e.LOCAL_LLM_API_KEY || 'ollama',
    },
    /** `AI_PROVIDER_<FEATURE>` / `AI_MODEL_<FEATURE>`, keyed by lowercased feature. */
    providerOverrides: collectByPattern(/^AI_PROVIDER_(\w+)$/),
    modelOverrides: collectByPattern(/^AI_MODEL_(\w+)$/),
    endpoints: {
      chat: e.MEDAI_CHAT_ENDPOINT || `${internalApiBase}/api/ai/chat`,
      symptom: e.MEDAI_SYMPTOM_ENDPOINT || `${internalApiBase}/api/ai/symptom-analysis`,
      recovery: e.MEDAI_RECOVERY_ENDPOINT || `${internalApiBase}/api/ai/recovery-prediction`,
    },
  },

  byt: {
    prescriptionType: bytType === 'N' ? 'N' : bytType === 'H' ? 'H' : 'C',
    facilityCode: str(e.BYT_FACILITY_CODE || 'TC001')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .padEnd(5, '0')
      .slice(0, 5),
    facilityPhone: str(e.BYT_FACILITY_PHONE || '1900 1800'),
    facilityName: str(e.BYT_FACILITY_NAME || 'TechCare'),
    facilityAddress: bytFacilityAddress,
  },
} as const;

export type AppConfig = typeof config;

/** Demo seed password, published in the docs: never accepted as DEFAULT_ACCOUNT_PASSWORD. */
export const PUBLISHED_DEMO_PASSWORD = 'Test@1234';

/**
 * Production settings that are not fatal (today's deploys run without them) but weaken security.
 * Logged once at startup by index.ts.
 */
export function configWarnings(c: AppConfig = config): string[] {
  if (!c.isProduction) return [];
  const warnings: string[] = [];
  if (!c.auth.imageEncryptionKey) {
    warnings.push('IMAGE_ENCRYPTION_KEY is not set: saving/reading encrypted doctor signatures will fail.');
  }
  if (!c.auth.internalApiSecret) {
    warnings.push('INTERNAL_API_SECRET is not set: internal AI routes answer 500.');
  }
  if (!c.auth.defaultAccountPassword || c.auth.defaultAccountPassword === PUBLISHED_DEMO_PASSWORD) {
    warnings.push('DEFAULT_ACCOUNT_PASSWORD is not set (or is the published demo password): admins cannot create accounts.');
  }
  if (c.rateLimit.benchmarkBypass) {
    warnings.push('BENCHMARK_RATE_LIMIT_BYPASS is enabled: rate limiting can be bypassed in production.');
  }
  return warnings;
}
