/**
 * Operational (expected) HTTP errors. Throw these from services/validators/controllers;
 * `middleware/errorHandler` turns them into the standard JSON error response.
 * Anything that is NOT an AppError is treated as a bug: logged, and answered with a generic 500.
 */
export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  /** 5xx only: send `message` instead of the generic text. Use for fixed, non-sensitive text. */
  expose: boolean;

  constructor(
    message: string,
    statusCode = 500,
    options: { code?: string; details?: unknown; expose?: boolean } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = Number.isFinite(Number(statusCode)) ? Number(statusCode) : 500;
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose === true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

type ErrorOptions = { code?: string; details?: unknown };

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', options: ErrorOptions = {}) {
    super(message, 400, { code: 'BAD_REQUEST', ...options });
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', options: ErrorOptions = {}) {
    super(message, 401, { code: 'UNAUTHORIZED', ...options });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', options: ErrorOptions = {}) {
    super(message, 403, { code: 'FORBIDDEN', ...options });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', options: ErrorOptions = {}) {
    super(message, 404, { code: 'NOT_FOUND', ...options });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', options: ErrorOptions = {}) {
    super(message, 409, { code: 'CONFLICT', ...options });
    this.name = 'ConflictError';
  }
}
