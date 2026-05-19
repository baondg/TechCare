export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 500, options: { code?: string } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = Number.isFinite(Number(statusCode)) ? Number(statusCode) : 500;
    this.code = options.code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
