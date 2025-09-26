import interact from 'interactjs';
import * as pdfjsLib from 'pdfjs-dist';
import { pdfService } from '../services/pdfService.js';
import { annotationStore } from '../store/annotationStore.js';
import type { Annotation } from '../../shared/types/annotation.js';
import { ANNOTATION_TYPES } from '../../shared/types/annotation.js';

export class PdfViewer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLElement;
  private currentPage: number = 1;
  private renderScale: number = 1.5;
  private rotation: number = 0;
  private isCreatingAnnotation: boolean = false;
  private startPoint: { x: number; y: number } | null = null;
  private selectionBox: HTMLElement | null = null;
  private snapToContents: boolean = false;
  private restoreFocus: {
    annotationId: string;
    selectionStart: number;
    selectionEnd: number;
  } | null = null;
  private uiState = new Map<string, { textCollapsed: boolean; typeCollapsed: boolean }>();

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.overlay = document.createElement('div');
    
    this.setupElements();
    this.setupEventListeners();
  }

  private makeToggle(
    collapsed: boolean,
    onToggle: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn';
    btn.innerHTML = collapsed ? '+' : '−';
    btn.title = collapsed ? 'Expand' : 'Collapse';
    btn.addEventListener('mousedown', e => e.stopPropagation()); // keep drag logic intact
    btn.addEventListener('click', e => { e.stopPropagation(); onToggle(); });
    return btn;
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

  setSnapToContents(enabled: boolean): void {
    this.snapToContents = enabled;
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
      const pageInfo = await pdfService.renderPage(pageNumber, this.canvas, this.renderScale, this.rotation);
      this.renderScale = pageInfo.scale;
      this.rotation = pageInfo.rotation;
      
      this.overlay.style.width = `${pageInfo.width}px`;
      this.overlay.style.height = `${pageInfo.height}px`;
      
      this.renderAnnotations();
    } catch (error) {
      console.error('Failed to render page:', error);
    }
  }

  private renderAnnotations(): void {
    // Memory clean-up: remove UI state for deleted annotations
    const alive = new Set(annotationStore.getStore().annotations.map(a => a.id));
    for (const id of this.uiState.keys()) if (!alive.has(id)) this.uiState.delete(id);
    
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
    
    const stack = new Error().stack?.split('\n').slice(1, 4).map(line => line.trim()).join(' | ') || 'unknown';
    console.group(`🎨 Rendering annotations for page ${this.currentPage}`);
    console.log(`Total annotations in store: ${annotations.length}`);
    console.log(`Annotations for current page ${this.currentPage}: ${pageAnnotations.length}`);
    console.log(`Called from: ${stack}`);
    
    if (annotations.length > 0) {
      // Show page distribution
      const pageDistribution: Record<number, number> = {};
      annotations.forEach(a => {
        pageDistribution[a.page_number] = (pageDistribution[a.page_number] || 0) + 1;
      });
      console.log(`Page distribution:`, pageDistribution);
      
      if (pageAnnotations.length === 0) {
        console.warn(`⚠️ No annotations found for page ${this.currentPage}. Available pages:`, Object.keys(pageDistribution).map(Number).sort((a, b) => a - b));
      }
    }
    
    pageAnnotations.forEach((annotation, index) => {
      try {
        const annotationElement = this.createAnnotationElement(annotation);
        this.overlay.appendChild(annotationElement);
        console.log(`✅ Rendered annotation ${index + 1}/${pageAnnotations.length}: ${annotation.type} at (${annotation.left}, ${annotation.top})`);
      } catch (error) {
        console.error(`❌ Failed to render annotation ${index + 1}:`, annotation, error);
      }
    });
    
    console.groupEnd();

    // Add / update sequence badges
    pageAnnotations.forEach((a, idx) => {
      const el = this.overlay.querySelector(`[data-annotation-id="${a.id}"]`) as HTMLElement;
      if (!el) return;

      let badge = el.querySelector('.seq-badge') as HTMLElement | null;
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'seq-badge';
        el.appendChild(badge);
      }
      badge.textContent = String(idx + 1);
    });

    if (this.restoreFocus) {
      const annotationBox = this.overlay.querySelector(
        `.annotation-box[data-annotation-id="${this.restoreFocus.annotationId}"]`
      );
      const textInput = annotationBox?.querySelector('.text-input');
      
      // Only focus if not hidden by global UI toggle
      if (textInput && (textInput as HTMLElement).offsetParent !== null) {
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
    // Ensure we have UI state for this annotation
    if (!this.uiState.has(annotation.id)) {
      this.uiState.set(annotation.id, { textCollapsed: false, typeCollapsed: false });
    }
    const state = this.uiState.get(annotation.id)!;
    
    const box = document.createElement('div');
    box.className = 'annotation-box';
    box.dataset.annotationId = annotation.id;
    
    // Use the canvas dimensions as a fallback if page dimensions are missing from the annotation data
    const page_width = annotation.page_width || this.canvas.width;
    const page_height = annotation.page_height || this.canvas.height;
    
    const initialScaleX = this.canvas.width / page_width;
    const initialScaleY = this.canvas.height / page_height;
    
    box.style.left = `${annotation.left * initialScaleX}px`;
    box.style.top = `${annotation.top * initialScaleY}px`;
    box.style.width = `${annotation.width * initialScaleX}px`;
    box.style.height = `${annotation.height * initialScaleY}px`;
    
    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(handle => {
      const handleEl = document.createElement('div');
      handleEl.className = `resize-handle ${handle}`;
      handleEl.dataset.handle = handle;
      box.appendChild(handleEl);
    });
    
    // Add type selector
    const select = document.createElement('select');
    select.className = 'annotation-dropdown';
    select.innerHTML = ANNOTATION_TYPES
      .map(t => `<option value="${t}" ${annotation.type === t ? 'selected' : ''}>${t}</option>`)
      .join('');
    
    if (state.typeCollapsed) select.classList.add('collapsed');
    
    const typeTgl = this.makeToggle(state.typeCollapsed, () => {
      state.typeCollapsed = !state.typeCollapsed;
      this.renderAnnotations();
    });
    typeTgl.className = 'toggle-btn type-toggle';
    
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      annotationStore.updateAnnotation(annotation.id, { type: target.value as any });
    });
    
    select.addEventListener('mousedown', e => e.stopPropagation());
    
    box.appendChild(typeTgl);
    box.appendChild(select);
    
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete annotation';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      annotationStore.deleteAnnotation(annotation.id);
    });
    
    deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
    
    box.appendChild(deleteBtn);
    
    // Add text input field
    const textArea = document.createElement('textarea');
    textArea.value = annotation.text || '';
    textArea.placeholder = 'Enter annotation text...';
    textArea.className = 'text-input';
    
    if (state.textCollapsed) textArea.classList.add('collapsed');
    
    const textTgl = this.makeToggle(state.textCollapsed, () => {
      state.textCollapsed = !state.textCollapsed;
      this.renderAnnotations();
    });
    textTgl.className = 'toggle-btn text-toggle';
    
    textArea.addEventListener('focus', () => {
      if (state.textCollapsed) {
        state.textCollapsed = false;
        this.renderAnnotations();
      } else {
        textArea.style.height = 'auto';
        const newHeight = Math.min(textArea.scrollHeight, 150);
        textArea.style.height = `${newHeight}px`;
        textArea.style.overflowY = 'auto';
        textArea.style.zIndex = '1001';
      }
    });
    
    textArea.addEventListener('blur', () => {
      textArea.style.height = '1.5rem';
      textArea.style.overflowY = 'hidden';
      textArea.style.zIndex = '1000';
      setTimeout(() => {
        annotationStore.flushTextUpdate(annotation.id, textArea.value);
      }, 0);
    });
    
    textArea.addEventListener('input', (e) => {
      const target = e.target as HTMLTextAreaElement;
      annotationStore.debounceTextUpdate(annotation.id, target.value);
    });
    
    textArea.addEventListener('mousedown', e => e.stopPropagation());
    
    textArea.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
      }
    });
    
    box.appendChild(textTgl);
    box.appendChild(textArea);
    
    // Set up interact.js for drag and resize

    interact(box)
      .draggable({
        ignoreFrom: 'input, textarea, select, .toggle-btn, .delete-btn',
        listeners: {
          start: () => {
            annotationStore.selectAnnotation(annotation);
            box.classList.add('dragging');
            // Create drag preview overlay
            const overlay = document.createElement('div');
            overlay.className = 'drag-preview';
            overlay.style.left = box.style.left;
            overlay.style.top = box.style.top;
            overlay.style.width = box.style.width;
            overlay.style.height = box.style.height;
            overlay.dataset.annotationId = annotation.id;
            this.overlay.appendChild(overlay);
          },
          move: (event) => {
            const { dx, dy } = event;
            const currentLeft = parseFloat(box.style.left);
            const currentTop = parseFloat(box.style.top);
            box.style.left = `${currentLeft + dx}px`;
            box.style.top = `${currentTop + dy}px`;
            
            // Update drag preview overlay
            const previewOverlay = this.overlay.querySelector(`.drag-preview[data-annotation-id="${annotation.id}"]`) as HTMLElement;
            if (previewOverlay) {
              previewOverlay.style.left = box.style.left;
              previewOverlay.style.top = box.style.top;
            }
          },
          end: () => {
            box.classList.remove('dragging');
            
            // Remove drag preview overlay
            const previewOverlay = this.overlay.querySelector(`.drag-preview[data-annotation-id="${annotation.id}"]`);
            if (previewOverlay) {
              previewOverlay.remove();
            }
            
            const finalLeft = parseFloat(box.style.left);
            const finalTop = parseFloat(box.style.top);

            annotationStore.updateAnnotation(annotation.id, {
              left: finalLeft / initialScaleX,
              top: finalTop / initialScaleY,
            });
          },
        },
        modifiers: [
          interact.modifiers.restrictRect({ restriction: 'parent' }),
        ],
      })
      .resizable({
        ignoreFrom: 'input, textarea, select, .toggle-btn, .delete-btn',
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          start: () => {
            annotationStore.selectAnnotation(annotation);
            box.classList.add('resizing');
            // Create resize preview overlay
            const overlay = document.createElement('div');
            overlay.className = 'resize-preview';
            overlay.style.left = box.style.left;
            overlay.style.top = box.style.top;
            overlay.style.width = box.style.width;
            overlay.style.height = box.style.height;
            overlay.dataset.annotationId = annotation.id;
            this.overlay.appendChild(overlay);
          },
          move: (event) => {
            const { width, height } = event.rect;
            const { left, top } = event.deltaRect;

            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
            
            const currentLeft = parseFloat(box.style.left);
            const currentTop = parseFloat(box.style.top);
            box.style.left = `${currentLeft + left}px`;
            box.style.top = `${currentTop + top}px`;
            
            // Update preview overlay
            const previewOverlay = this.overlay.querySelector(`.resize-preview[data-annotation-id="${annotation.id}"]`) as HTMLElement;
            if (previewOverlay) {
              previewOverlay.style.left = box.style.left;
              previewOverlay.style.top = box.style.top;
              previewOverlay.style.width = box.style.width;
              previewOverlay.style.height = box.style.height;
            }
          },
          end: () => {
            box.classList.remove('resizing');
            
            // Remove preview overlay
            const previewOverlay = this.overlay.querySelector(`.resize-preview[data-annotation-id="${annotation.id}"]`);
            if (previewOverlay) {
              previewOverlay.remove();
            }
            
            const finalLeft = parseFloat(box.style.left);
            const finalTop = parseFloat(box.style.top);
            const finalWidth = parseFloat(box.style.width);
            const finalHeight = parseFloat(box.style.height);

            annotationStore.updateAnnotation(annotation.id, {
              left: finalLeft / initialScaleX,
              top: finalTop / initialScaleY,
              width: finalWidth / initialScaleX,
              height: finalHeight / initialScaleY
            });
          }
        },
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: 'parent',
          }),
          interact.modifiers.restrictSize({
            min: { width: 10, height: 10 },
          }),
        ],
      });
    
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
    }
  }

  private async handleMouseUp(event: MouseEvent): Promise<void> {
    if (this.isCreatingAnnotation && this.startPoint) {
      await this.finishCreatingAnnotation(event);
    }
    
    this.isCreatingAnnotation = false;
  }

  private async finishCreatingAnnotation(event: MouseEvent): Promise<void> {
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
      let selection = { x: left, y: top, w: width, h: height };
      if (this.snapToContents) {
        selection = this.snapSelectionToContents(selection);
      }
      const extractedText = await this.extractTextFromSelectionScreenRect(selection);
      const annotation: Omit<Annotation, 'id'> = {
        left: selection.x,
        top: selection.y,
        width: selection.w,
        height: selection.h,
        page_number: this.currentPage,
        page_width: this.canvas.width,
        page_height: this.canvas.height,
        text: extractedText,
        type: 'Text',
      };
      
      annotationStore.addAnnotation(annotation);
    }
  }

  private async extractTextFromSelectionScreenRect(sel: { x: number; y: number; w: number; h: number }): Promise<string> {
    try {
      const page = await pdfService.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: this.renderScale, rotation: this.rotation });
      const textContent = await pdfService.getTextContent(this.currentPage);

      const TOL = 5; // pixel tolerance to include items that touch the boundary
      const contains = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) =>
        inner.x >= outer.x - TOL &&
        inner.y >= outer.y - TOL &&
        inner.x + inner.w <= outer.x + outer.w + TOL &&
        inner.y + inner.h <= outer.y + outer.h + TOL;

      const pieces: Array<{ y: number; x: number; str: string }> = [];

      for (const item of (textContent.items as any[])) {
        const m = (pdfjsLib as any).Util.transform(viewport.transform, (item as any).transform);
        const x = m[4];
        const y = m[5];
        const scaleY = Math.hypot(m[1], m[3]);
        const h = scaleY;
        const w = (item as any).width; // already in viewport units
        // In viewport/canvas space, origin is top-left and y increases downward.
        // m[5] is the text baseline; shift up by height to get the top-left box y.
        const box = { x, y: y - h, w, h };
        if (contains(sel, box)) {
          pieces.push({ y: box.y, x: box.x, str: (item as any).str });
        }
      }

      pieces.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : a.y - b.y));
      const raw = pieces.map(p => p.str).join(' ');
      return this.sanitizeExtractedText(raw);
    } catch (err) {
      console.error('Text extraction failed:', err);
      return '';
    }
  }

  private sanitizeExtractedText(text: string): string {
    let cleaned = text.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/([A-Za-z])\s+([.,])/g, '$1$2');
    return cleaned.trim();
  }

  // --- Snapping helpers ---
  private clampRectToCanvas(sel: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    const x = Math.max(0, Math.min(sel.x, this.canvas.width - 1));
    const y = Math.max(0, Math.min(sel.y, this.canvas.height - 1));
    const maxW = this.canvas.width - x;
    const maxH = this.canvas.height - y;
    const w = Math.max(0, Math.min(sel.w, maxW));
    const h = Math.max(0, Math.min(sel.h, maxH));
    return { x, y, w, h };
  }

  private snapSelectionToContents(sel: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    const clamped = this.clampRectToCanvas({
      x: Math.floor(sel.x),
      y: Math.floor(sel.y),
      w: Math.ceil(sel.w),
      h: Math.ceil(sel.h),
    });
    if (clamped.w <= 0 || clamped.h <= 0) return sel;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return sel;

    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(clamped.x, clamped.y, clamped.w, clamped.h);
    } catch {
      return sel;
    }

    const data = imageData.data;
    const stride = clamped.w * 4;
    let minX = clamped.w, minY = clamped.h, maxX = -1, maxY = -1;

    const isContent = (r: number, g: number, b: number, a: number) => {
      if (a < 16) return false;
      const nearWhite = (r > 245 && g > 245 && b > 245);
      return !nearWhite;
    };

    const step = 1;

    for (let y = 0; y < clamped.h; y += step) {
      for (let x = 0; x < clamped.w; x += step) {
        const idx = y * stride + x * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (isContent(r, g, b, a)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      return sel;
    }

    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(clamped.w - 1, maxX + pad);
    maxY = Math.min(clamped.h - 1, maxY + pad);

    const snapped = {
      x: clamped.x + minX,
      y: clamped.y + minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
    };

    if (snapped.w < 10 || snapped.h < 10) {
      return sel;
    }

    return snapped;
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
