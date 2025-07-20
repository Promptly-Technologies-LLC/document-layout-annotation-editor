import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import { FileService } from '../services/fileService.js';
import { S3Service } from '../services/s3Service.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { SaveRequestSchema, SyncRequestSchema } from '../../shared/validation.js';
import type { SaveRequest, SyncRequest, ApiResponse, FileListResponse } from '../../shared/types/annotation.js';

const router = Router();
const fileService = new FileService();

// Lazy initialization of S3Service to avoid requiring AWS env vars on startup
let s3Service: S3Service | null = null;
function getS3Service(): S3Service {
  if (!s3Service) {
    s3Service = new S3Service();
  }
  return s3Service;
}

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
router.post('/save-json', validate(SaveRequestSchema), asyncHandler(async (req: Request, res: Response) => {
  const { filename, data } = req.body as SaveRequest;
  
  const filePath = await fileService.saveAnnotations(filename, data);
  
  const response: ApiResponse<{ path: string }> = {
    success: true,
    message: `Successfully saved ${filename}`,
    data: { path: filePath },
  };
  
  res.json(response);
}));

// Sync annotations to S3
router.post('/sync', validate(SyncRequestSchema), asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.body as SyncRequest;
  
  // 1. Read local file content
  const localPath = fileService.getOutputPath(filename);
  const content = await fs.readFile(localPath, 'utf-8');

  // 2. Find file in S3 to determine the key
  const s3 = getS3Service();
  const existingKey = await s3.findFileKey(filename);
  const s3Key = existingKey || filename; // Use existing key or place at root

  // 3. Upload to S3
  await s3.uploadFile(s3Key, content);

  const response: ApiResponse<{ s3Key: string }> = {
    success: true,
    message: `Successfully synced ${filename} to S3.`,
    data: { s3Key },
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
