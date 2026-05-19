/// <reference types="express" />

declare namespace Express {
  interface Request {
    requestId?: string;
  }
}