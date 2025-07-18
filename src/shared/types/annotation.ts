export type AnnotationType = 
  | 'Title'
  | 'Section header'
  | 'Text'
  | 'Picture'
  | 'Table'
  | 'List item'
  | 'Formula'
  | 'Footnote'
  | 'Page header'
  | 'Page footer'
  | 'Caption';

export interface Annotation {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  page_number: number;
  page_width: number;
  page_height: number;
  text: string;
  type: AnnotationType;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface SaveRequest {
  filename: string;
  data: Annotation[];
}

export interface FileListResponse {
  pdfFiles: string[];
  jsonFiles: string[];
}

export interface FileInfo {
  name: string;
  size: number;
  lastModified: Date;
  type: string;
}
