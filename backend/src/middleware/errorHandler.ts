import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError';

function operationalStatus(err: unknown): { status: number; message: string; code?: string } | null {
  if (err instanceof AppError) {
    return { status: err.statusCode, message: err.message, code: err.code };
  }
  if (err instanceof Error) {
    const sc = (err as Error & { statusCode?: unknown }).statusCode;
    if (typeof sc === 'number' && Number.isFinite(sc) && sc >= 400 && sc < 600) {
      return { status: sc, message: err.message };
    }
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const op = operationalStatus(err);
  if (op) {
    res.status(op.status).json({
      success: false,
      message: op.message,
      ...(op.code ? { code: op.code } : {}),
    });
    return;
  }

  console.error('Error:', err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message,
  });
};
