import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from './errorHandler.js';

// A generic validation middleware factory
export const validate = (schema: z.ZodSchema) => 
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return next(new AppError(400, `Invalid request body: ${errors.join(', ')}`));
    }

    req.body = result.data; // Replace body with parsed (and sanitized) data
    next();
};
