import type { Annotation } from '../../shared/types/annotation.js';
import { AnnotationSchema } from '../../shared/validation.js';
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
    const validationResult = AnnotationSchema.array().safeParse(annotations);
    
    if (!validationResult.success) {
      console.error("Invalid annotation data received:", validationResult.error.issues);
      const validAnnotations = annotations
        .map(a => AnnotationSchema.safeParse(a))
        .filter(r => r.success)
        .map(r => (r as { success: true; data: Annotation }).data);
      this.store.annotations = validAnnotations;
    } else {
      this.store.annotations = validationResult.data;
    }
    
    this.store.isDirty = false;
    this.notify();
  }

  addAnnotation(annotation: Omit<Annotation, 'id'>): Annotation {
    const newAnnotation: Annotation = {
      ...annotation,
      id: crypto.randomUUID(),
    };
    
    // Find the index to insert after the last annotation on the same page
    let insertIndex = this.store.annotations.length;
    for (let i = this.store.annotations.length - 1; i >= 0; i--) {
      if (this.store.annotations[i].page_number === newAnnotation.page_number) {
        insertIndex = i + 1;
        break;
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
    // Map for O(1) lookup
    const byId = new Map(this.store.annotations.map(a => [a.id, a]));
    const reordered = newIds
      .map(id => byId.get(id))
      .filter(Boolean) as Annotation[];

    // ignore if nothing really changed
    if (reordered.length === this.store.annotations.length) {
      this.store.annotations = reordered;
      this.store.isDirty = true;
      this.scheduleAutoSave();
      this.notify();
    }
  }

  private notify(): void {
    const stack = new Error().stack?.split('\n').slice(1, 4).map(line => line.trim()).join(' | ') || 'unknown';
    console.log('AnnotationStore notify() called from:', stack);
    this.listeners.forEach(listener => listener(this.getStore()));
  }
}

export const annotationStore = new AnnotationStoreManager();
