import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { ApiError } from '../lib/errors.js';

type Part = 'body' | 'query' | 'params';

/**
 * Validates one part of the request against a Zod schema and replaces it with the parsed value
 * (so handlers get trimmed strings, coerced numbers and defaults). Invalid input → 400 with field-level details.
 */
export function validate(part: Part, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({ field: i.path.join('.') || part, message: i.message }));
      return next(ApiError.badRequest('Some fields are invalid', fields));
    }
    // Express 5 exposes req.query as a getter, so store parsed values on a dedicated property instead of overwriting.
    if (part === 'query') (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    else req[part] = result.data;
    next();
  };
}

export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: unknown }).validatedQuery as T;
}

export const uuidParam = z.object({ id: z.uuid('Invalid id') });
