import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// Single place that turns errors into responses. Known ApiErrors keep their status and code;
// malformed JSON becomes a 400; anything unexpected is logged and returned as a generic 500
// without leaking internals (stack traces only outside production).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } });
    return;
  }
  logger.error('Unhandled error', { method: req.method, path: req.path, error: String(err) });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
      details: isProduction ? undefined : String(err instanceof Error ? err.stack : err),
    },
  });
}
