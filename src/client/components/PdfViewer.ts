import { pdfService } from '../services/pdfService.js';
import { annotationStore } from '../store/annotationStore.js';
import type { Annotation } from '../../shared/types/annotation.js';

export class PdfViewer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLElement;
  private currentPage: number = 1;
  private isCreatingAnnotation: boolean = false;
  private startPoint: { x: number; y: number } | null = null;
  private selectedBox: HTMLElement | null = null;
  private isDragging: boolean = false;
  private isResizing: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('div');
    
    this.setupElements();
    this.setupEventListeners();
  }

  private setupElements(): void {
    this.container.className = 'relative bg-white shadow-lg rounded-lg overflow-hidden';
    
    this.canvas.className = 'block';
    this.overlay.className = 'absolute inset-0';
    
    this.container.appendChild(this.canvas);
    this.container.appendChild(this.overlay);
  }

  private setupEventListeners(): void {
    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.overlay.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.overlay.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // Subscribe to annotation changes
    annotationStore.subscribe(() => this.renderAnnotations());
  }

  async loadPdf(pdfUrl: string): Promise<void> {
    try {
      await pdfService.loadPdf(pdfUrl);
      await this.renderPage(1);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      throw error;
    }
  }

  async renderPage(pageNumber: number): Promise<void> {
    try {
      this.currentPage = pageNumber;
      const pageInfo = await pdfService.renderPage(pageNumber, this.canvas);
      
      this.overlay.style.width = `${pageInfo.width}px`;
      this.overlay.style.height = `${pageInfo.height}px`;
      
      this.renderAnnotations();
    } catch (error) {
      console.error('Failed to render page:', error);
    }
  }

  private renderAnnotations(): void {
    // Clear existing annotations
    this.overlay.querySelectorAll('.annotation-box').forEach(el => el.remove());
    
    const annotations = annotationStore.getStore().annotations;
    const pageAnnotations = annotations.filter(a => a.page_number === this.currentPage);
    
    pageAnnotations.forEach(annotation => {
      this.createAnnotationElement(annotation);
    });
  }

  private createAnnotationElement(annotation: Annotation): HTMLElement {
    const box = document.createElement('div');
    box.className = 'annotation-box';
    box.dataset.annotationId = annotation.id;
    
    const scaleX = this.canvas.width / annotation.page_width;
    const scaleY = this.canvas.height / annotation.page_height;
    
    box.style.left = `${annotation.left * scaleX}px`;
    box.style.top = `${annotation.top * scaleY}px`;
    box.style.width = `${annotation.width * scaleX}px`;
    box.style.height = `${annotation.height * scaleY}px`;
    
    // Add label
    const label = document.createElement('div');
    label.className = 'annotation-label';
    label.textContent = annotation.type;
    box.appendChild(label);
    
    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(handle => {
      const handleEl = document.createElement('div');
      handleEl.className = `resize-handle ${handle}`;
      box.appendChild(handleEl);
    });
    
    // Add type selector
    const select = document.createElement('select');
    select.className = 'absolute -top-8 right-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs';
    select.innerHTML = `
      <option value="text" ${annotation.type === 'text' ? 'selected' : ''}>Text</option>
      <option value="image" ${annotation.type === 'image' ? 'selected' : ''}>Image</option>
      <option value="table" ${annotation.type === 'table' ? 'selected' : ''}>Table</option>
      <option value="figure" ${annotation.type === 'figure' ? 'selected' : ''}>Figure</option>
      <option value="header" ${annotation.type === 'header' ? 'selected' : ''}>Header</option>
      <option value="footer" ${annotation.type === 'footer' ? 'selected' : ''}>Footer</option>
      <option value="title" ${annotation.type === 'title' ? 'selected' : ''}>Title</option>
      <option value="paragraph" ${annotation.type === 'paragraph' ? 'selected' : ''}>Paragraph</option>
      <option value="list" ${annotation.type === 'list' ? 'selected' : ''}>List</option>
      <option value="other" ${annotation.type === 'other' ? 'selected' : ''}>Other</option>
    `;
    
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      annotationStore.updateAnnotation(annotation.id, { type: target.value as any });
    });
    
    box.appendChild(select);
    
    // Event listeners
    box.addEventListener('mousedown', (e) => this.handleAnnotationMouseDown(e, annotation));
    
    return box;
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.target === this.overlay) {
      this.startCreatingAnnotation(event);
    }
  }

  private startCreatingAnnotation(event: MouseEvent): void {
    const rect = this.overlay.getBoundingClientRect();
    this.startPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    this.isCreatingAnnotation = true;
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isCreatingAnnotation && this.startPoint) {
      // TODO: Implement visual feedback for annotation creation
    } else if (this.isDragging && this.selectedBox) {
      this.updateDraggingAnnotation(event);
    } else if (this.isResizing && this.selectedBox) {
      // TODO: Implement resizing functionality
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.isCreatingAnnotation && this.startPoint) {
      this.finishCreatingAnnotation(event);
    }
    this.isCreatingAnnotation = false;
    this.isDragging = false;
    this.isResizing = false;
  }

  private finishCreatingAnnotation(event: MouseEvent): void {
    const rect = this.overlay.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;
    
    const left = Math.min(this.startPoint!.x, endX);
    const top = Math.min(this.startPoint!.y, endY);
    const width = Math.abs(endX - this.startPoint!.x);
    const height = Math.abs(endY - this.startPoint!.y);
    
    if (width > 10 && height > 10) {
      const annotation: Omit<Annotation, 'id'> = {
        left: left / this.canvas.width * 100,
        top: top / this.canvas.height * 100,
        width: width / this.canvas.width * 100,
        height: height / this.canvas.height * 100,
        page_number: this.currentPage,
        page_width: 100,
        page_height: 100,
        text: '',
        type: 'text',
      };
      
      annotationStore.addAnnotation(annotation);
    }
  }

  private handleAnnotationMouseDown(event: MouseEvent, annotation: Annotation): void {
    event.stopPropagation();
    
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('resize-handle')) {
      this.startResizing(event, annotation, target.className.split(' ')[1]);
    } else {
      this.startDragging(event, annotation);
    }
    
    annotationStore.selectAnnotation(annotation);
  }

  private startDragging(event: MouseEvent, annotation: Annotation): void {
    this.isDragging = true;
    const rect = this.overlay.getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left - (annotation.left * this.canvas.width / 100),
      y: event.clientY - rect.top - (annotation.top * this.canvas.height / 100),
    };
  }

  private startResizing(_event: MouseEvent, _annotation: Annotation, _handle: string): void {
    this.isResizing = true;
  }

  private updateDraggingAnnotation(event: MouseEvent): void {
    const rect = this.overlay.getBoundingClientRect();
    const x = event.clientX - rect.left - this.dragOffset.x;
    const y = event.clientY - rect.top - this.dragOffset.y;
    
    const annotation = annotationStore.getStore().selectedAnnotation;
    if (annotation) {
      annotationStore.updateAnnotation(annotation.id, {
        left: Math.max(0, Math.min(x / this.canvas.width * 100, 100 - annotation.width)),
        top: Math.max(0, Math.min(y / this.canvas.height * 100, 100 - annotation.height)),
      });
    }
  }

  

  getCurrentPage(): number {
    return this.currentPage;
  }

  async nextPage(): Promise<void> {
    const totalPages = pdfService.getTotalPages();
    if (this.currentPage < totalPages) {
      await this.renderPage(this.currentPage + 1);
    }
  }

  async prevPage(): Promise<void> {
    if (this.currentPage > 1) {
      await this.renderPage(this.currentPage - 1);
    }
  }
}
