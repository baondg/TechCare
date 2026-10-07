/**
 * Application logger: one JSON object per line on stdout.
 *
 * - `msg` is the event name/message (Cloud Logging queries use `jsonPayload.msg`).
 * - `severity` lets Cloud Logging classify lines (INFO/WARNING/ERROR) without a sidecar.
 * - Errors go under `err` so pino serializes message + stack.
 * - Credentials are redacted; never log request bodies (they carry PHI).
 *
 * Usage:
 *   logger.info({ requestId, userId }, 'ai.orchestration');
 *   logger.error({ err }, 'Create cover request failed');
 *
 * LOG_LEVEL: trace | debug | info (default) | warn | error | fatal | silent
 */
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'techcare-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label, number) {
      const severity = label === 'warn' ? 'WARNING' : label === 'fatal' ? 'CRITICAL' : label.toUpperCase();
      return { severity, level: number };
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
});

export = logger;
