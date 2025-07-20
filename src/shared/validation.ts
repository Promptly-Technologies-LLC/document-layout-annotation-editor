// src/shared/validation.ts
import { z } from 'zod';

// Base schema for a single annotation. This replaces the manual `isValidAnnotation` check.
export const AnnotationSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)), // Allow UUID or any non-empty string for legacy/new
  left: z.number(),
  top: z.number(),
  width: z.number().gte(0),
  height: z.number().gte(0),
  page_number: z.number().int().positive(),
  page_width: z.number().positive(),
  page_height: z.number().positive(),
  text: z.string(),
  type: z.enum([
    'Title', 'Section header', 'Text', 'Picture', 'Table',
    'List item', 'Formula', 'Footnote', 'Page header', 'Page footer', 'Caption',
  ]),
});

// Schema for the `/api/save-json` endpoint body.
export const SaveRequestSchema = z.object({
  filename: z.string().refine(val => val.endsWith('.json'), {
    message: "Filename must have .json extension",
  }),
  data: z.array(AnnotationSchema),
});

// Schema for the `/api/sync` endpoint body.
export const SyncRequestSchema = z.object({
  filename: z.string().refine(val => val.endsWith('.json'), {
    message: "Filename must have .json extension",
  }),
});

// Schema for the `/api/files` response.
export const FileListResponseSchema = z.object({
  pdfFiles: z.array(z.string()),
  jsonFiles: z.array(z.string()),
});

// Now, we infer our TypeScript types directly from the schemas.
export type Annotation = z.infer<typeof AnnotationSchema>;
export type SaveRequest = z.infer<typeof SaveRequestSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type FileListResponse = z.infer<typeof FileListResponseSchema>;

// Keep other shared types that don't have a direct schema equivalent
export interface FileInfo {
  name: string;
  size: number;
  lastModified: Date;
  type: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}