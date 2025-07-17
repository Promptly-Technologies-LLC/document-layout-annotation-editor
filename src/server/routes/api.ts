import { Router, Request, Response } from 'express';
import { FileService } from '../services/fileService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateSaveRequest } from '../middleware/validation.js';
import { ApiResponse, SaveRequest, FileListResponse } from '../../shared/types/annotation.js';

const router = Router();
const fileService = new FileService();

// Get list of available files
router.get('/files', asyncHandler(async (_req: Request, res: Response) => {
  const files = await fileService.listFiles();
  
  const response: ApiResponse<FileListResponse> = {
    success: true,
    data: files,
  };
  
  res.json(response);
}));

// Save annotations
router.post('/save-json', validateSaveRequest, asyncHandler(async (req: Request, res: Response) => {
  const { filename, data } = req.body as SaveRequest;
  
  const filePath = await fileService.saveAnnotations(filename, data);
  
  const response: ApiResponse<{ path: string }> = {
    success: true,
    message: `Successfully saved ${filename}`,
    data: { path: filePath },
  };
  
  res.json(response);
}));

// Load annotations
router.get('/annotations/:filename', asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.params;
  
  if (!filename.endsWith('.json')) {
    throw new Error('Invalid file format');
  }
  
  const data = await fileService.loadAnnotations(filename);
  
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
  };
  
  res.json(response);
}));

// Get file info
router.get('/file-info/:type/:filename', asyncHandler(async (req: Request, res: Response) => {
  const { type, filename } = req.params;
  
  if (type !== 'pdf' && type !== 'json') {
    throw new Error('Invalid file type');
  }
  
  const info = await fileService.getFileInfo(filename, type);
  
  const response: ApiResponse<typeof info> = {
    success: true,
    data: info,
  };
  
  res.json(response);
}));

export default router;
