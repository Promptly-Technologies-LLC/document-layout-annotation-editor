// Re-export types and schemas from the single source of truth.
export * from '../validation.js';

export const ANNOTATION_TYPES = [
  'Title', 'Section header', 'Text', 'Picture', 'Table',
  'List item', 'Formula', 'Footnote', 'Page header', 'Page footer', 'Caption',
] as const;

export type AnnotationType = typeof ANNOTATION_TYPES[number];
