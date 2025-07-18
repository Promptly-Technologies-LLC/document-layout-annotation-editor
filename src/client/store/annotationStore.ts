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

  setAnnotations(annotations: Annotation[]): void {
    this.store.annotations = [...annotations];
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

  updateAnnotation(id: string, updates: Partial<Annotation>): void {
    const index = this.store.annotations.findIndex(a => a.id === id);
    if (index !== -1) {
      this.store.annotations[index] = { ...this.store.annotations[index], ...updates };
      this.store.isDirty = true;
      this.scheduleAutoSave();
      this.notify();
    }
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

  private notify(): void {
    this.listeners.forEach(listener => listener(this.getStore()));
  }
}

export const annotationStore = new AnnotationStoreManager();
