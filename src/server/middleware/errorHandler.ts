import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../shared/types/annotation.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    message = 'Invalid JSON format';
  }

  const response: ApiResponse<never> = {
    success: false,
    error: message,
  };

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${error.message}`);
  
  res.status(statusCode).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
