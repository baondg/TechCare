import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Standard error body. `error` and `message` carry the same text: older clients read
 * `error`, newer ones `message` (frontend `api/client.ts` reads both).
 */
type ErrorBody = {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
};

const INTERNAL_MESSAGE = 'Internal Server Error';

/** Expected errors whose message is safe to show the client. */
function operationalError(err: unknown): { status: number; message: string; code?: string; details?: unknown } | null {
  if (err instanceof AppError) {
    return { status: err.statusCode, message: err.message, code: err.code, details: err.details };
  }
  if (err instanceof Error) {
    // Legacy `e.statusCode = 400` errors and http-errors from body-parser (`status` + `expose`).
    const e = err as Error & { statusCode?: unknown; status?: unknown; expose?: unknown };
    const status = typeof e.statusCode === 'number' ? e.statusCode : e.status;
    if (typeof status === 'number' && Number.isFinite(status) && status >= 400 && status < 500) {
      return { status, message: err.message };
    }
  }
  return null;
}

function body(message: string, requestId: string | undefined, extra: Partial<ErrorBody> = {}): ErrorBody {
  return {
    success: false,
    error: message,
    message,
    ...extra,
    ...(requestId ? { requestId } : {}),
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const op = operationalError(err);
  if (op && op.status < 500) {
    res.status(op.status).json(
      body(op.message, req.requestId, {
        ...(op.code ? { code: op.code } : {}),
        ...(op.details !== undefined ? { details: op.details } : {}),
      })
    );
    return;
  }

  // Unexpected: never leak internals (SQL, stack, PHI in messages) to the client.
  console.error('Unhandled error', { requestId: req.requestId, method: req.method, path: req.path, err });
  const status = op?.status ?? 500;
  res.status(status).json(body(status === 500 ? INTERNAL_MESSAGE : op!.message, req.requestId, op?.code ? { code: op.code } : {}));
};

/** JSON 404 for unmatched routes (instead of Express's default HTML page). */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body(`Route not found: ${req.method} ${req.path}`, req.requestId, { code: 'ROUTE_NOT_FOUND' }));
};
