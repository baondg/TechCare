import pinoHttp from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import logger from '../common/logger';

/**
 * One access-log line per request ("http.request"), bound to the X-Request-ID set by
 * requestIdMiddleware (must run first). Handlers can use `req.log` for request-scoped logs.
 * Only method/url/status are logged — no headers or bodies.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as IncomingMessage & { requestId?: string }).requestId ?? '',
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: () => 'http.request',
  customErrorMessage: () => 'http.request',
  serializers: {
    req: (req: IncomingMessage & { id?: unknown }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
  },
});
