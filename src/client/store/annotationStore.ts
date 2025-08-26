import type { Annotation } from '../../shared/types/annotation.js';
import { FlexibleAnnotationSchema } from '../../shared/validation.js';
import { apiService } from '../services/api.js';

export interface AnnotationStore {
  annotations: Annotation[];
  selectedAnnotation: Annotation | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
}

export class AnnotationStoreManager {
  private store: AnnotationStore = {
    annotations: [],
    selectedAnnotation: null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  };

  private listeners: Array<(store: AnnotationStore) => void> = [];
  private saveTimeout: NodeJS.Timeout | null = null;
  private textUpdateTimeouts: Map<string, NodeJS.Timeout> = new Map();

  subscribe(listener: (store: AnnotationStore) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getStore(): AnnotationStore {
    return { ...this.store };
  }

  setAnnotations(annotations: any[]): void {
    // Validate and sanitize annotations before setting them in the store.
    const validationResult = FlexibleAnnotationSchema.array().safeParse(annotations);
    
    if (!validationResult.success) {
      console.group("🚨 Invalid annotation data received:");
      console.log(`Total annotations: ${annotations.length}`);
      console.log(`Validation errors:`, validationResult.error.issues);
      
      // Log the first few invalid annotations for debugging
      const sampleInvalid = annotations.slice(0, 3);
      console.log("Sample of first 3 annotations:", sampleInvalid);
      
      // Individual validation to identify problematic annotations and add IDs
      const validAnnotations: Annotation[] = [];
      const invalidAnnotations: any[] = [];
      
      annotations.forEach((annotation, index) => {
        const flexibleResult = FlexibleAnnotationSchema.safeParse(annotation);
        if (flexibleResult.success) {
          // Add ID if missing
          const data = flexibleResult.data;
          const annotationWithId: Annotation = 'id' in data && data.id
            ? data as Annotation
            : { ...data, id: crypto.randomUUID() };
          validAnnotations.push(annotationWithId);
        } else {
          invalidAnnotations.push({
            index,
            annotation,
            errors: flexibleResult.error.issues.map(issue => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code
            }))
          });
        }
      });
      
      console.log(`✅ Valid annotations: ${validAnnotations.length}`);
      console.log(`❌ Invalid annotations: ${invalidAnnotations.length}`);
      
      if (invalidAnnotations.length > 0) {
        console.log("First 5 invalid annotations:", invalidAnnotations.slice(0, 5));
        
        // Summary of common errors
        const errorCounts: Record<string, number> = {};
        invalidAnnotations.forEach(item => {
          item.errors.forEach((error: any) => {
            const key = `${error.path}: ${error.message}`;
            errorCounts[key] = (errorCounts[key] || 0) + 1;
          });
        });
        
        console.log("Common validation errors:", errorCounts);
      }
      
      console.groupEnd();

      this.store.annotations = validAnnotations;
    } else {
      console.log(`✅ All ${annotations.length} annotations are valid`);
      // Ensure all annotations have IDs even in the success case
      const annotationsWithIds: Annotation[] = validationResult.data.map(annotation => {
        return 'id' in annotation && annotation.id 
          ? annotation as Annotation
          : { ...annotation, id: crypto.randomUUID() };
      });
      this.store.annotations = annotationsWithIds;
    }
    
    this.store.isDirty = false;
    this.notify();
  }

  addAnnotation(annotation: Omit<Annotation, 'id'>): Annotation {
    const newAnnotation: Annotation = {
      ...annotation,
      id: crypto.randomUUID(),
    };
    
    // Determine insertion index:
    // 1) After the last annotation on the same page, if any
    // 2) Otherwise, after the last annotation of any earlier page
    // 3) Otherwise, at the start (no earlier pages)
    let insertIndex = this.store.annotations.length;
    let foundSamePage = false;
    for (let i = this.store.annotations.length - 1; i >= 0; i--) {
      const a = this.store.annotations[i];
      if (a.page_number === newAnnotation.page_number) {
        insertIndex = i + 1;
        foundSamePage = true;
        break;
      }
    }
    if (!foundSamePage) {
      insertIndex = 0; // default to start; will move past any earlier pages below
      for (let i = 0; i < this.store.annotations.length; i++) {
        const a = this.store.annotations[i];
        if (a.page_number <= newAnnotation.page_number) {
          insertIndex = i + 1;
        } else {
          // first later page encountered, stop
          break;
        }
      }
    }
    
    this.store.annotations.splice(insertIndex, 0, newAnnotation);
    this.store.isDirty = true;
    this.scheduleAutoSave();
    this.notify();
    
    return newAnnotation;
  }

  updateAnnotation(id: string, updates: Partial<Annotation>, skipRender: boolean = false): void {
    const index = this.store.annotations.findIndex(a => a.id === id);
    if (index !== -1) {
      // Ensure positive width/height regardless of drag direction
      const normalizedUpdates = { ...updates };
      if (updates.width !== undefined) {
        normalizedUpdates.width = Math.abs(updates.width);
      }
      if (updates.height !== undefined) {
        normalizedUpdates.height = Math.abs(updates.height);
      }
      
      this.store.annotations[index] = { ...this.store.annotations[index], ...normalizedUpdates };
      this.store.isDirty = true;
      this.scheduleAutoSave();
      if (!skipRender) {
        this.notify();
      }
    }
  }

  debounceTextUpdate(annotationId: string, text: string): void {
    if (this.textUpdateTimeouts.has(annotationId)) {
      clearTimeout(this.textUpdateTimeouts.get(annotationId));
    }
    
    const timeout = setTimeout(() => {
      this.updateAnnotation(annotationId, { text }, true);
      this.textUpdateTimeouts.delete(annotationId);
    }, 500);
    
    this.textUpdateTimeouts.set(annotationId, timeout);
  }

  flushTextUpdate(annotationId: string, text: string): void {
    if (this.textUpdateTimeouts.has(annotationId)) {
      clearTimeout(this.textUpdateTimeouts.get(annotationId));
      this.textUpdateTimeouts.delete(annotationId);
    }
    this.updateAnnotation(annotationId, { text }, true);
  }

  deleteAnnotation(id: string): void {
    this.store.annotations = this.store.annotations.filter(a => a.id !== id);
    if (this.store.selectedAnnotation?.id === id) {
      this.store.selectedAnnotation = null;
    }
    this.store.isDirty = true;
    this.scheduleAutoSave();
    this.notify();
  }

  selectAnnotation(annotation: Annotation | null): void {
    this.store.selectedAnnotation = annotation;
    this.notify();
  }

  getAnnotationsForPage(pageNumber: number): Annotation[] {
    return this.store.annotations.filter(a => a.page_number === pageNumber);
  }

  async loadAnnotations(filename: string): Promise<void> {
    try {
      const annotations = await apiService.loadAnnotations(filename);
      this.setAnnotations(annotations);
    } catch (error) {
      console.error('Failed to load annotations:', error);
      this.setAnnotations([]);
    }
  }

  async saveAnnotations(filename: string): Promise<void> {
    if (!this.store.isDirty || this.store.isSaving) return;

    this.store.isSaving = true;
    // Don't notify for isSaving state changes - they don't affect annotation rendering

    try {
      await apiService.saveAnnotations(filename, this.store.annotations);
      this.store.isDirty = false;
      this.store.lastSaved = new Date();
    } catch (error) {
      console.error('Failed to save annotations:', error);
      throw error;
    } finally {
      this.store.isSaving = false;
      // Don't notify for isSaving state changes - they don't affect annotation rendering
    }
  }

  private scheduleAutoSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      // Emit auto-save event
      window.dispatchEvent(new CustomEvent('autoSaveRequested'));
    }, 2000);
  }

  reorderAnnotations(newIds: string[]): void {
    if (newIds.length === 0) return;

    const byId = new Map(this.store.annotations.map(a => [a.id, a]));
    // Validate all IDs exist
    const missing = newIds.filter(id => !byId.has(id));
    if (missing.length > 0) return;

    // Determine the page for these IDs (assume all on same page, as provided by SequencePanel)
    const pageNumber = byId.get(newIds[0])!.page_number;
    const pageIds = this.store.annotations
      .filter(a => a.page_number === pageNumber)
      .map(a => a.id);

    // Ensure newIds is a permutation of current page's IDs
    const sameCardinality = pageIds.length === newIds.length;
    const sameMembers = sameCardinality && new Set(pageIds).size === new Set(newIds).size && pageIds.every(id => newIds.includes(id));
    if (!sameMembers) return;

    // Replace annotations for this page in-place maintaining positions, only changing order among them
    let nextIndex = 0;
    const nextByOrder = newIds.map(id => byId.get(id)!) as Annotation[];

    this.store.annotations = this.store.annotations.map(a => {
      if (a.page_number === pageNumber) {
        const replacement = nextByOrder[nextIndex++];
        return replacement;
      }
      return a;
    });

    this.store.isDirty = true;
    this.scheduleAutoSave();
    this.notify();
  }

  private notify(): void {
    const stack = new Error().stack?.split('\n').slice(1, 4).map(line => line.trim()).join(' | ') || 'unknown';
    console.log('AnnotationStore notify() called from:', stack);
    this.listeners.forEach(listener => listener(this.getStore()));
  }
}

export const annotationStore = new AnnotationStoreManager();
