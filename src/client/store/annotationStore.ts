import type { Annotation } from '../../shared/types/annotation.js';
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
    // Ensure all annotations have valid IDs and conform to the Annotation interface
    this.store.annotations = annotations.map(annotation => ({
      ...annotation,
      id: annotation.id || crypto.randomUUID()
    })) as Annotation[];
    this.store.isDirty = false;
    this.notify();
  }

  addAnnotation(annotation: Omit<Annotation, 'id'>): Annotation {
    const newAnnotation: Annotation = {
      ...annotation,
      id: crypto.randomUUID(),
    };
    
    this.store.annotations.push(newAnnotation);
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
    this.notify();

    try {
      await apiService.saveAnnotations(filename, this.store.annotations);
      this.store.isDirty = false;
      this.store.lastSaved = new Date();
    } catch (error) {
      console.error('Failed to save annotations:', error);
      throw error;
    } finally {
      this.store.isSaving = false;
      this.notify();
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
    this.listeners.forEach(listener => listener(this.getStore()));
  }
}

export const annotationStore = new AnnotationStoreManager();
