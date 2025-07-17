import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export const validateSaveRequest = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const { filename, data } = req.body;

  if (!filename || typeof filename !== 'string') {
    throw new AppError(400, 'Filename is required and must be a string');
  }

  if (!filename.endsWith('.json')) {
    throw new AppError(400, 'Filename must have .json extension');
  }

  if (!Array.isArray(data)) {
    throw new AppError(400, 'Data must be an array of annotations');
  }

  // Validate each annotation
  for (const annotation of data) {
    if (
      typeof annotation.left !== 'number' ||
      typeof annotation.top !== 'number' ||
      typeof annotation.width !== 'number' ||
      typeof annotation.height !== 'number' ||
      typeof annotation.page_number !== 'number' ||
      typeof annotation.page_width !== 'number' ||
      typeof annotation.page_height !== 'number' ||
      typeof annotation.text !== 'string' ||
      typeof annotation.type !== 'string'
    ) {
      throw new AppError(400, 'Invalid annotation format');
    }
  }

  next();
};
