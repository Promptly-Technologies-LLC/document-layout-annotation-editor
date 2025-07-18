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
  private selectionBox: HTMLElement | null = null;
  private activeAnnotation: Annotation | null = null;
  private resizeStartBounds: { left: number; top: number; width: number; height: number } | null = null;
  private oppositeCorner: { x: number; y: number } | null = null;
  private resizeOverlay: HTMLElement | null = null;
  private restoreFocus: {
    annotationId: string;
    selectionStart: number;
    selectionEnd: number;
  } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('div');
    
    this.setupElements();
    this.setupEventListeners();
  }

  private setupElements(): void {
    this.container.className = 'relative bg-white shadow-lg rounded-lg overflow-visible';
    
    this.canvas.className = 'block';
    this.overlay.className = 'absolute inset-0';
    
    // The canvas and overlay will be added on first render.
  }

  private setupEventListeners(): void {
    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.overlay.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.overlay.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // Subscribe to annotation changes
    annotationStore.subscribe(() => this.renderAnnotations());
  }

  private prepareContainer(): void {
    // Check if the container has been prepared by seeing if the canvas is a child.
    if (!this.container.contains(this.canvas)) {
      this.container.innerHTML = ''; // Clear placeholder content
      this.container.appendChild(this.canvas);
      this.container.appendChild(this.overlay);
    }
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
    this.prepareContainer(); // Ensures the canvas is in the DOM and placeholder is removed.
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
    const activeElement = document.activeElement;
    if (activeElement?.classList.contains('text-input')) {
      const annotationBox = (activeElement as HTMLElement).closest('.annotation-box') as HTMLElement;
      const annotationId = annotationBox?.dataset.annotationId;
      if (annotationId) {
        this.restoreFocus = {
          annotationId,
          selectionStart: (activeElement as HTMLTextAreaElement).selectionStart || 0,
          selectionEnd: (activeElement as HTMLTextAreaElement).selectionEnd || 0
        };
      }
    }
    
    // Clear existing annotations safely
    this.overlay.querySelectorAll('.annotation-box').forEach(el => {
      if (el.parentNode === this.overlay) {
        el.remove();
      }
    });
    
    const annotations = annotationStore.getStore().annotations;
    const pageAnnotations = annotations.filter(a => a.page_number === this.currentPage);
    
    console.log('Rendering annotations for page', this.currentPage, pageAnnotations);
    
    pageAnnotations.forEach(annotation => {
      const annotationElement = this.createAnnotationElement(annotation);
      this.overlay.appendChild(annotationElement);
    });

    if (this.restoreFocus) {
      const annotationBox = this.overlay.querySelector(
        `.annotation-box[data-annotation-id="${this.restoreFocus.annotationId}"]`
      );
      const textInput = annotationBox?.querySelector('.text-input');
      
      if (textInput) {
        (textInput as HTMLTextAreaElement).focus();
        (textInput as HTMLTextAreaElement).setSelectionRange(
          this.restoreFocus.selectionStart,
          this.restoreFocus.selectionEnd
        );
      }
      this.restoreFocus = null;
    }
  }

  private createAnnotationElement(annotation: Annotation): HTMLElement {
    const box = document.createElement('div');
    box.className = 'annotation-box absolute border-2 border-blue-500 bg-blue-100 bg-opacity-20 cursor-move';
    box.dataset.annotationId = annotation.id;
    
    // Use the canvas dimensions as a fallback if page dimensions are missing from the annotation data
    const page_width = annotation.page_width || this.canvas.width;
    const page_height = annotation.page_height || this.canvas.height;
    
    const scaleX = this.canvas.width / page_width;
    const scaleY = this.canvas.height / page_height;
    
    box.style.left = `${annotation.left * scaleX}px`;
    box.style.top = `${annotation.top * scaleY}px`;
    box.style.width = `${annotation.width * scaleX}px`;
    box.style.height = `${annotation.height * scaleY}px`;
    
    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(handle => {
      const handleEl = document.createElement('div');
      handleEl.className = `resize-handle ${handle} absolute w-2 h-2 bg-blue-500`;
      handleEl.dataset.handle = handle; // Store handle type
      
      if (handle === 'nw') handleEl.style.cssText = 'top: -1px; left: -1px; cursor: nw-resize;';
      if (handle === 'ne') handleEl.style.cssText = 'top: -1px; right: -1px; cursor: ne-resize;';
      if (handle === 'sw') handleEl.style.cssText = 'bottom: -1px; left: -1px; cursor: sw-resize;';
      if (handle === 'se') handleEl.style.cssText = 'bottom: -1px; right: -1px; cursor: se-resize;';
      
      box.appendChild(handleEl);
    });
    
    // Add type selector
    const select = document.createElement('select');
    select.className = 'annotation-dropdown absolute -top-7 right-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs';
    select.innerHTML = `
      <option value="Text" ${annotation.type === 'Text' ? 'selected' : ''}>Text</option>
      <option value="Title" ${annotation.type === 'Title' ? 'selected' : ''}>Title</option>
      <option value="Section header" ${annotation.type === 'Section header' ? 'selected' : ''}>Section header</option>
      <option value="Picture" ${annotation.type === 'Picture' ? 'selected' : ''}>Picture</option>
      <option value="Table" ${annotation.type === 'Table' ? 'selected' : ''}>Table</option>
      <option value="List item" ${annotation.type === 'List item' ? 'selected' : ''}>List item</option>
      <option value="Formula" ${annotation.type === 'Formula' ? 'selected' : ''}>Formula</option>
      <option value="Footnote" ${annotation.type === 'Footnote' ? 'selected' : ''}>Footnote</option>
      <option value="Page header" ${annotation.type === 'Page header' ? 'selected' : ''}>Page header</option>
      <option value="Page footer" ${annotation.type === 'Page footer' ? 'selected' : ''}>Page footer</option>
      <option value="Caption" ${annotation.type === 'Caption' ? 'selected' : ''}>Caption</option>
    `;
    
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      annotationStore.updateAnnotation(annotation.id, { type: target.value as any });
    });
    
    // Prevent mousedown from bubbling up to the annotation box handler
    select.addEventListener('mousedown', e => e.stopPropagation());
    
    box.appendChild(select);
    
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn absolute -top-7 -right-7 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600';
    deleteBtn.style.zIndex = '1000';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete annotation';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      annotationStore.deleteAnnotation(annotation.id);
    });
    
    // Prevent mousedown from bubbling up to the annotation box handler
    deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
    
    box.appendChild(deleteBtn);
    
    // Add text input field
    const textArea = document.createElement('textarea');
    textArea.value = annotation.text || '';
    textArea.placeholder = 'Enter annotation text...';
    textArea.className = 'text-input absolute left-0 right-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs';
    textArea.style.top = '100%';
    textArea.style.zIndex = '1000';
    textArea.style.height = '1.5rem';
    textArea.style.resize = 'none';
    textArea.style.overflow = 'hidden';
    textArea.style.transition = 'height 0.2s ease';
    
    textArea.addEventListener('focus', () => {
      textArea.style.height = 'auto';
      const newHeight = Math.min(textArea.scrollHeight, 150);
      textArea.style.height = `${newHeight}px`;
      textArea.style.overflowY = 'auto';
      textArea.style.zIndex = '1001';
    });
    
    textArea.addEventListener('blur', () => {
      textArea.style.height = '1.5rem';
      textArea.style.overflowY = 'hidden';
      textArea.style.zIndex = '1000';
      // Use setTimeout to avoid conflicts with the current render cycle
      setTimeout(() => {
        annotationStore.flushTextUpdate(annotation.id, textArea.value);
      }, 0);
    });
    
    textArea.addEventListener('input', (e) => {
      const target = e.target as HTMLTextAreaElement;
      annotationStore.debounceTextUpdate(annotation.id, target.value);
    });
    
    // Prevent mousedown from bubbling up to the annotation box handler
    textArea.addEventListener('mousedown', e => e.stopPropagation());
    
    box.appendChild(textArea);
    
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
    
    // Create selection box for visual feedback
    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'absolute border-2 border-dashed border-primary-500 bg-primary-100 bg-opacity-20 pointer-events-none';
    this.selectionBox.style.left = `${this.startPoint.x}px`;
    this.selectionBox.style.top = `${this.startPoint.y}px`;
    this.selectionBox.style.width = '0px';
    this.selectionBox.style.height = '0px';
    this.overlay.appendChild(this.selectionBox);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isCreatingAnnotation && this.startPoint && this.selectionBox) {
      const rect = this.overlay.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      
      const left = Math.min(this.startPoint.x, currentX);
      const top = Math.min(this.startPoint.y, currentY);
      const width = Math.abs(currentX - this.startPoint.x);
      const height = Math.abs(currentY - this.startPoint.y);
      
      this.selectionBox.style.left = `${left}px`;
      this.selectionBox.style.top = `${top}px`;
      this.selectionBox.style.width = `${width}px`;
      this.selectionBox.style.height = `${height}px`;
    } else if (this.isDragging && this.selectedBox) {
      this.updateDraggingAnnotation(event);
    } else if (this.isResizing && this.selectedBox) {
      this.updateResizingAnnotation(event);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.isCreatingAnnotation && this.startPoint) {
      this.finishCreatingAnnotation(event);
    }

    // Commit the final position to the store and reset the state
    if (this.isDragging && this.selectedBox && this.activeAnnotation) {
      const newLeftPx = parseFloat(this.selectedBox.style.left);
      const newTopPx = parseFloat(this.selectedBox.style.top);
      
      const scaleX = this.canvas.width / this.activeAnnotation.page_width;
      const scaleY = this.canvas.height / this.activeAnnotation.page_height;
      
      annotationStore.updateAnnotation(this.activeAnnotation.id, {
        left: newLeftPx / scaleX,
        top: newTopPx / scaleY,
      });
    }

    // Commit the final size and position to the store for resize operations
    if (this.isResizing && this.resizeOverlay && this.activeAnnotation) {
      // Get final coordinates from overlay
      const finalLeft = parseFloat(this.resizeOverlay.style.left);
      const finalTop = parseFloat(this.resizeOverlay.style.top);
      const finalWidth = parseFloat(this.resizeOverlay.style.width);
      const finalHeight = parseFloat(this.resizeOverlay.style.height);

      // Remove overlay
      this.overlay.removeChild(this.resizeOverlay);
      this.resizeOverlay = null;

      // Validate dimensions before update
      if (isNaN(finalLeft) || isNaN(finalTop) || 
          isNaN(finalWidth) || isNaN(finalHeight) ||
          finalWidth <= 0 || finalHeight <= 0) {
        console.warn('Invalid resize dimensions. Update skipped.');
      } else {
        // Update annotation with normalized coordinates
        const scaleX = this.canvas.width / this.activeAnnotation.page_width;
        const scaleY = this.canvas.height / this.activeAnnotation.page_height;
        
        annotationStore.updateAnnotation(this.activeAnnotation.id, {
          left: finalLeft / scaleX,
          top: finalTop / scaleY,
          width: finalWidth / scaleX,
          height: finalHeight / scaleY,
        });
      }
    }
    
    this.isCreatingAnnotation = false;
    this.isDragging = false;
    this.isResizing = false;
    this.activeAnnotation = null;
    this.selectedBox = null;
    this.resizeStartBounds = null;
    this.oppositeCorner = null;
    if (this.resizeOverlay) {
      this.overlay.removeChild(this.resizeOverlay);
      this.resizeOverlay = null;
    }
  }

  private finishCreatingAnnotation(event: MouseEvent): void {
    if (this.selectionBox) {
      this.overlay.removeChild(this.selectionBox);
      this.selectionBox = null;
    }
    
    const rect = this.overlay.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;
    
    const left = Math.min(this.startPoint!.x, endX);
    const top = Math.min(this.startPoint!.y, endY);
    const width = Math.abs(endX - this.startPoint!.x);
    const height = Math.abs(endY - this.startPoint!.y);
    
    if (width > 10 && height > 10) {
      const annotation: Omit<Annotation, 'id'> = {
        left: left,
        top: top,
        width: width,
        height: height,
        page_number: this.currentPage,
        page_width: this.canvas.width,
        page_height: this.canvas.height,
        text: '',
        type: 'Text',
      };
      
      annotationStore.addAnnotation(annotation);
    }
  }

  private handleAnnotationMouseDown(event: MouseEvent, annotation: Annotation): void {
    event.stopPropagation();
    
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('resize-handle')) {
      // Find the handle direction from the class list
      const handleClass = Array.from(target.classList).find(cls => 
        ['nw', 'ne', 'sw', 'se'].includes(cls)
      );
      if (handleClass) {
        this.startResizing(event, annotation, handleClass);
      }
    } else {
      this.startDragging(event, annotation);
    }
    
    annotationStore.selectAnnotation(annotation);
  }

  private startDragging(event: MouseEvent, annotation: Annotation): void {
    this.isDragging = true;
    this.activeAnnotation = annotation;
    this.selectedBox = event.currentTarget as HTMLElement;

    const rect = this.overlay.getBoundingClientRect();
    const scaleX = this.canvas.width / annotation.page_width;
    const scaleY = this.canvas.height / annotation.page_height;
    
    this.dragOffset = {
      x: event.clientX - rect.left - (annotation.left * scaleX),
      y: event.clientY - rect.top - (annotation.top * scaleY),
    };
  }

  private startResizing(event: MouseEvent, annotation: Annotation, handle: string): void {
    this.isResizing = true;
    this.activeAnnotation = annotation;
    // Get the parent annotation box instead of the resize handle
    this.selectedBox = (event.target as HTMLElement).parentElement as HTMLElement;
    
    // Store the initial bounds for resize calculations
    this.resizeStartBounds = {
      left: parseFloat(this.selectedBox.style.left),
      top: parseFloat(this.selectedBox.style.top),
      width: parseFloat(this.selectedBox.style.width),
      height: parseFloat(this.selectedBox.style.height),
    };
    
    // Store opposite corner coordinates based on handle
    const bounds = this.resizeStartBounds;
    this.oppositeCorner = {
      x: handle.includes('e') ? bounds.left : bounds.left + bounds.width,
      y: handle.includes('s') ? bounds.top : bounds.top + bounds.height
    };
    
    // Create resize overlay
    this.createResizeOverlay();
  }

  private createResizeOverlay(): void {
    this.resizeOverlay = document.createElement('div');
    this.resizeOverlay.className = 'resize-overlay absolute border-2 border-dashed border-blue-500 bg-blue-100 bg-opacity-20 pointer-events-none';
    
    // Initialize with current dimensions
    if (this.resizeStartBounds) {
      this.resizeOverlay.style.left = `${this.resizeStartBounds.left}px`;
      this.resizeOverlay.style.top = `${this.resizeStartBounds.top}px`;
      this.resizeOverlay.style.width = `${this.resizeStartBounds.width}px`;
      this.resizeOverlay.style.height = `${this.resizeStartBounds.height}px`;
    }
    
    this.overlay.appendChild(this.resizeOverlay);
  }

  private updateDraggingAnnotation(event: MouseEvent): void {
    if (!this.isDragging || !this.selectedBox) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = event.clientX - rect.left - this.dragOffset.x;
    const y = event.clientY - rect.top - this.dragOffset.y;

    this.selectedBox.style.left = `${Math.max(0, x)}px`;
    this.selectedBox.style.top = `${Math.max(0, y)}px`;
  }

  private updateResizingAnnotation(event: MouseEvent): void {
    if (!this.isResizing || !this.selectedBox || !this.oppositeCorner || !this.resizeOverlay) return;

    const rect = this.overlay.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate new rectangle coordinates (allow coordinate swapping)
    const newRect = {
      left: Math.min(this.oppositeCorner.x, mouseX),
      top: Math.min(this.oppositeCorner.y, mouseY),
      right: Math.max(this.oppositeCorner.x, mouseX),
      bottom: Math.max(this.oppositeCorner.y, mouseY)
    };

    // Convert to width/height format
    const width = newRect.right - newRect.left;
    const height = newRect.bottom - newRect.top;

    // Ensure minimum dimensions
    const minSize = 10;
    if (width < minSize || height < minSize) {
      return; // Don't update if too small
    }

    // Ensure bounds stay within the overlay
    const finalLeft = Math.max(0, Math.min(newRect.left, this.overlay.offsetWidth - width));
    const finalTop = Math.max(0, Math.min(newRect.top, this.overlay.offsetHeight - height));
    const finalWidth = Math.min(width, this.overlay.offsetWidth - finalLeft);
    const finalHeight = Math.min(height, this.overlay.offsetHeight - finalTop);

    // Update overlay preview
    this.resizeOverlay.style.left = `${finalLeft}px`;
    this.resizeOverlay.style.top = `${finalTop}px`;
    this.resizeOverlay.style.width = `${finalWidth}px`;
    this.resizeOverlay.style.height = `${finalHeight}px`;

    // Update selected box (live preview)
    this.selectedBox.style.left = `${finalLeft}px`;
    this.selectedBox.style.top = `${finalTop}px`;
    this.selectedBox.style.width = `${finalWidth}px`;
    this.selectedBox.style.height = `${finalHeight}px`;
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
