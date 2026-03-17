import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = result.error as ZodError;
      return res.status(400).json({
        error: 'Validation failed',
        details: err.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}
