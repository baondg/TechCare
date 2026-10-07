import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { BadRequestError } from '../errors/AppError';

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };

/**
 * Validates (and coerces) req.params / req.query / req.body against zod schemas.
 * On success the parsed values replace the raw ones, so handlers get typed, normalised input.
 * On failure: 400 BAD_REQUEST with `details: [{ path, message }]`.
 *
 *   router.put('/:id/accept', validate({ params: idParam }), controller.accept);
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const issues: { path: string; message: string }[] = [];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
        continue;
      }
      if (part === 'query') {
        // req.query is a getter in newer Express versions; mutate in place instead of reassigning.
        const query = req.query as Record<string, unknown>;
        for (const key of Object.keys(query)) delete query[key];
        Object.assign(query, result.data);
      } else {
        req[part] = result.data;
      }
    }
    if (issues.length > 0) {
      next(new BadRequestError(issues[0]!.message, { code: 'VALIDATION_ERROR', details: issues }));
      return;
    }
    next();
  };
}
