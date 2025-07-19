import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { ANNOTATION_TYPES, type Annotation } from '../../shared/types/annotation.js';

const isValidAnnotation = (obj: any): obj is Annotation => {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.left === 'number' &&
    typeof obj.top === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number' &&
    typeof obj.page_number === 'number' &&
    typeof obj.page_width === 'number' &&
    typeof obj.page_height === 'number' &&
    typeof obj.text === 'string' &&
    ANNOTATION_TYPES.includes(obj.type)
  );
};

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
    if (!isValidAnnotation(annotation)) {
      throw new AppError(400, 'Invalid annotation format');
    }
  }

  next();
};
