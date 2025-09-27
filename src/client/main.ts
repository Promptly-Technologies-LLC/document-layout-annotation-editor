import { PdfViewer } from './components/PdfViewer.js';
import { FileManager } from './components/FileManager.js';
import { SequencePanel } from './components/SequencePanel.js';
import { annotationStore } from './store/annotationStore.js';
import { pdfService } from './services/pdfService.js';
import { apiService } from './services/api.js';

class App {
  private pdfViewer: PdfViewer | null = null;
  private sequencePanel!: SequencePanel;
  private currentJson: string = '';
  private isSyncing: boolean = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white shadow-sm border-b">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-4">
              <h1 class="text-2xl font-bold text-gray-900">PDF Annotation Editor</h1>
              <div id="file-manager-header" class="flex items-center space-x-4"></div>
            </div>
          </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="border-b">
            <div class="flex items-center justify-between p-3 bg-white">
              <div class="flex items-center space-x-4">
                <!-- Margin controls left -->
                <div class="flex items-center space-x-3">
                  <label class="inline-flex items-center space-x-1 text-sm text-gray-700">
                    <span>Header inches</span>
                    <input id="hf-header-inches" type="number" min="0" step="0.25" value="0" class="input w-20">
                  </label>
                  <label class="inline-flex items-center space-x-1 text-sm text-gray-700">
                    <span>Footer inches</span>
                    <input id="hf-footer-inches" type="number" min="0" step="0.25" value="0" class="input w-20">
                  </label>
                  <button id="hf-apply" class="btn-secondary" title="Apply header/footer inches: reclassify existing annotations and set defaults for new boxes">Apply</button>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <!-- UI toggles beside Order -->
                <div id="ui-toggles" class="flex items-center space-x-3">
                  <label class="inline-flex items-center space-x-1 text-sm text-gray-700">
                    <input id="hide-types" type="checkbox" class="h-4 w-4 text-primary-600 border-gray-300 rounded">
                    <span>Hide labels</span>
                  </label>
                  <label class="inline-flex items-center space-x-1 text-sm text-gray-700">
                    <input id="hide-texts" type="checkbox" class="h-4 w-4 text-primary-600 border-gray-300 rounded">
                    <span>Hide text</span>
                  </label>
                  <label class="inline-flex items-center space-x-1 text-sm text-gray-700">
                    <input id="snap-contents" type="checkbox" class="h-4 w-4 text-primary-600 border-gray-300 rounded">
                    <span>Snap to contents</span>
                  </label>
                </div>
                <button id="seq-btn" class="btn-secondary">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                  </svg>
                  Order
                </button>
              </div>
            </div>
          </div>
        </div>

        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div class="bg-white rounded-lg shadow">
            <div class="flex items-center justify-between p-4 border-b">
              <div class="flex items-center space-x-4">
                <button id="prev-page" class="btn-secondary" disabled>
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                  </svg>
                  Previous
                </button>
                <span id="page-info" class="text-sm text-gray-600">Page 1 of 1</span>
                <button id="next-page" class="btn-secondary" disabled>
                  Next
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            <div id="pdf-viewer" class="p-4">
              <div class="text-center py-12 text-gray-500">
                <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                <p>Select a PDF file to begin annotating</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    this.setupComponents();
    this.setupEventListeners();
    this.setupStoreSubscription();
  }

  private setupComponents(): void {
    const fileManagerContainer = document.getElementById('file-manager-header')!;
    const pdfViewerContainer = document.getElementById('pdf-viewer')!;

    new FileManager(fileManagerContainer, {
      onPdfSelected: (filename) => this.handlePdfSelected(filename),
      onJsonSelected: (filename) => this.handleJsonSelected(filename),
      onFilesRefreshed: (files) => console.log('Files refreshed:', files),
    });

    this.pdfViewer = new PdfViewer(pdfViewerContainer);
    this.sequencePanel = new SequencePanel(document.body, this.pdfViewer);
  }

  private setupEventListeners(): void {
    const syncBtn = document.getElementById('sync-btn')!;
    const seqBtn = document.getElementById('seq-btn')!;
    const prevBtn = document.getElementById('prev-page')!;
    const nextBtn = document.getElementById('next-page')!;

    // Wire up UI toggle checkboxes
    const hideTypesEl = document.getElementById('hide-types') as HTMLInputElement | null;
    const hideTextsEl = document.getElementById('hide-texts') as HTMLInputElement | null;
    const snapEl = document.getElementById('snap-contents') as HTMLInputElement | null;

    if (hideTypesEl) {
      const pref = localStorage.getItem('hideAnnoTypes') === '1';
      hideTypesEl.checked = pref;
      document.body.classList.toggle('hide-anno-types', pref);

      hideTypesEl.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        document.body.classList.toggle('hide-anno-types', checked);
        localStorage.setItem('hideAnnoTypes', checked ? '1' : '0');
      });
    }

    if (hideTextsEl) {
      const pref = localStorage.getItem('hideAnnoTexts') === '1';
      hideTextsEl.checked = pref;
      document.body.classList.toggle('hide-anno-texts', pref);

      hideTextsEl.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        document.body.classList.toggle('hide-anno-texts', checked);
        localStorage.setItem('hideAnnoTexts', checked ? '1' : '0');
      });
    }

    // Snap-to-contents toggle
    if (snapEl) {
      const pref = localStorage.getItem('snapToContents') === '1';
      snapEl.checked = pref;
      this.pdfViewer?.setSnapToContents(pref);

      snapEl.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        localStorage.setItem('snapToContents', checked ? '1' : '0');
        this.pdfViewer?.setSnapToContents(checked);
      });
    }

    syncBtn.addEventListener('click', () => this.syncAnnotations());
    seqBtn.addEventListener('click', () => this.sequencePanel.toggle());
    prevBtn.addEventListener('click', async () => {
      await this.pdfViewer?.prevPage();
      this.updatePageInfo();
      this.sequencePanel.render();
    });
    nextBtn.addEventListener('click', async () => {
      await this.pdfViewer?.nextPage();
      this.updatePageInfo();
      this.sequencePanel.render();
    });
    
    // Auto-save event listener (This remains important for local saving)
    window.addEventListener('autoSaveRequested', () => {
      if (this.currentJson && annotationStore.getStore().isDirty) {
        // Just save locally, don't sync
        annotationStore.saveAnnotations(this.currentJson);
      }
    });

    // Header/Footer inches + apply
    const headerInput = document.getElementById('hf-header-inches') as HTMLInputElement | null;
    const footerInput = document.getElementById('hf-footer-inches') as HTMLInputElement | null;
    const applyBtn = document.getElementById('hf-apply');

    if (headerInput) {
      const saved = localStorage.getItem('hfHeaderInches');
      headerInput.value = saved ?? '0';
      headerInput.addEventListener('input', () => {
        const n = parseFloat(headerInput.value || '0');
        const val = isNaN(n) ? 0 : Math.max(0, n);
        this.pdfViewer?.setPreviewHeaderFooter({ headerInches: val });
      });
    }
    if (footerInput) {
      const saved = localStorage.getItem('hfFooterInches');
      footerInput.value = saved ?? '0';
      footerInput.addEventListener('input', () => {
        const n = parseFloat(footerInput.value || '0');
        const val = isNaN(n) ? 0 : Math.max(0, n);
        this.pdfViewer?.setPreviewHeaderFooter({ footerInches: val });
      });
    }

    const readInches = (input: HTMLInputElement | null, key: string) => {
      const raw = input?.value ?? '0';
      const n = parseFloat(raw);
      const val = isNaN(n) ? 0 : Math.max(0, n);
      localStorage.setItem(key, String(val));
      if (input) input.value = String(val);
      return val;
    };

    applyBtn?.addEventListener('click', async () => {
      const headerInches = readInches(headerInput, 'hfHeaderInches');
      const footerInches = readInches(footerInput, 'hfFooterInches');

      // Bulk reclassify both regions (header first, then footer)
      if (headerInches > 0) {
        await this.classifyRegionOnce('header', headerInches);
      }
      if (footerInches > 0) {
        await this.classifyRegionOnce('footer', footerInches);
      }

      // Enable autolabeling for future boxes
      this.pdfViewer?.setAutoHeaderFooter({ headerInches, footerInches });
      // Clear preview lines
      this.pdfViewer?.setPreviewHeaderFooter({ headerInches: null, footerInches: null });
      this.sequencePanel.render();
    });

    // Clear preview if clicking anywhere else in the app besides these inputs or Apply
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isHeaderInput = target.id === 'hf-header-inches';
      const isFooterInput = target.id === 'hf-footer-inches';
      const isApply = target.id === 'hf-apply';
      if (!isHeaderInput && !isFooterInput && !isApply) {
        this.pdfViewer?.setPreviewHeaderFooter({ headerInches: null, footerInches: null });
      }
    }, true);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  private async classifyRegionOnce(region: 'header' | 'footer', inches: number): Promise<void> {
    const totalPages = pdfService.getTotalPages();
    if (totalPages === 0) {
      alert('Load a PDF first.');
      return;
    }

    const pageHeightsInches = new Map<number, number>();
    for (let p = 1; p <= totalPages; p++) {
      const page = await pdfService.getPage(p);
      const viewportAt1 = page.getViewport({ scale: 1, rotation: 0 });
      pageHeightsInches.set(p, viewportAt1.height / 72);
    }

    const store = annotationStore.getStore();
    const prevSelected = store.selectedAnnotation;

    let changed = 0;
    for (const a of store.annotations) {
      const pageHeightInches = pageHeightsInches.get(a.page_number);
      if (!pageHeightInches || a.page_height <= 0) continue;

      const topEdgeInches = (a.top / a.page_height) * pageHeightInches;
      const bottomEdgeInches = ((a.top + a.height) / a.page_height) * pageHeightInches;

      if (region === 'header') {
        // Full containment: entire box within top `inches` band
        if (bottomEdgeInches <= inches && a.type !== 'Page header') {
          annotationStore.updateAnnotation(a.id, { type: 'Page header' }, true);
          changed++;
        }
      } else {
        // Full containment: entire box within bottom `inches` band
        if (topEdgeInches >= (pageHeightInches - inches) && a.type !== 'Page footer') {
          annotationStore.updateAnnotation(a.id, { type: 'Page footer' }, true);
          changed++;
        }
      }
    }

    if (changed > 0) {
      annotationStore.selectAnnotation(prevSelected);
      console.log(`Reclassified ${changed} annotations to ${region === 'header' ? 'Page header' : 'Page footer'}.`);
    } else {
      console.log('No annotations matched the selected region.');
    }
  }

  private setupStoreSubscription(): void {
    annotationStore.subscribe(() => this.updateStatus());
  }

  private updateStatus(): void {
    const store = annotationStore.getStore();
    const syncBtn = document.getElementById('sync-btn')! as HTMLButtonElement;
    const statusText = document.getElementById('status-text')!;
    
    // The Sync button should be enabled if there are changes to save, and we are not busy.
    syncBtn.disabled = !store.isDirty || store.isSaving || this.isSyncing;
    
    if (this.isSyncing) {
      statusText.textContent = 'Syncing to S3...';
    } else if (store.isSaving) {
      statusText.textContent = 'Saving...';
    } else if (store.lastSaved) {
      statusText.textContent = `Saved: ${store.lastSaved.toLocaleTimeString()}`;
    } else {
      statusText.textContent = '';
    }
  }

  private async handlePdfSelected(filename: string): Promise<void> {
    console.log('Loading PDF:', filename);
    try {
      await this.pdfViewer?.loadPdf(`/pdfs/${filename}`);
      console.log('PDF loaded successfully');
      this.updatePageInfo();
      this.sequencePanel.render();
      this.resetPerDocumentOptions();
    } catch (error) {
      console.error('Failed to load PDF:', error);
    }
  }

  private async handleJsonSelected(filename: string): Promise<void> {
    this.currentJson = filename;
    try {
      await annotationStore.loadAnnotations(filename);
      this.resetPerDocumentOptions();
    } catch (error) {
      console.error('Failed to load annotations:', error);
    }
  }

  private resetPerDocumentOptions(): void {
    // Reset auto-labeling thresholds and UI input
    this.pdfViewer?.setAutoHeaderFooter({ headerInches: null, footerInches: null });
    const headerInput = document.getElementById('hf-header-inches') as HTMLInputElement | null;
    const footerInput = document.getElementById('hf-footer-inches') as HTMLInputElement | null;
    if (headerInput) headerInput.value = '0';
    if (footerInput) footerInput.value = '0';
    // Reset toggles to persisted values (do not override user global prefs)
    const hideTypesEl = document.getElementById('hide-types') as HTMLInputElement | null;
    const hideTextsEl = document.getElementById('hide-texts') as HTMLInputElement | null;
    const snapEl = document.getElementById('snap-contents') as HTMLInputElement | null;
    if (hideTypesEl) hideTypesEl.checked = localStorage.getItem('hideAnnoTypes') === '1';
    if (hideTextsEl) hideTextsEl.checked = localStorage.getItem('hideAnnoTexts') === '1';
    if (snapEl) snapEl.checked = localStorage.getItem('snapToContents') === '1';
  }

  // This method is now only for local saving (autosave, shortcuts)
  private async saveAnnotations(): Promise<void> {
    if (!this.currentJson || !annotationStore.getStore().isDirty) {
      return;
    }
    try {
      await annotationStore.saveAnnotations(this.currentJson);
    } catch (error) {
      console.error('Failed to save annotations:', error);
      alert('Failed to save annotations locally.');
    }
  }
  
  // New method to handle the full sync process
  private async syncAnnotations(): Promise<void> {
    if (!this.currentJson || this.isSyncing || annotationStore.getStore().isSaving) {
      return;
    }

    this.isSyncing = true;
    this.updateStatus();

    try {
      // 1. First, ensure latest changes are saved locally.
      await this.saveAnnotations();
      
      // 2. Then, call the API to sync the local file to S3.
      await apiService.syncFile(this.currentJson);

      // Update status on success
      const statusText = document.getElementById('status-text')!;
      statusText.textContent = `Synced: ${new Date().toLocaleTimeString()}`;

    } catch (error) {
      console.error('Failed to sync annotations:', error);
      alert(`Failed to sync annotations: ${error}`);
      this.updateStatus(); // a full status refresh
    } finally {
      this.isSyncing = false;
      this.updateStatus(); // a full status refresh
    }
  }

  private updatePageInfo(): void {
    const pageInfo = document.getElementById('page-info')!;
    const prevBtn = document.getElementById('prev-page')!;
    const nextBtn = document.getElementById('next-page')!;

    const currentPage = this.pdfViewer?.getCurrentPage() || 1;
    const totalPages = pdfService.getTotalPages();
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    (prevBtn as HTMLButtonElement).disabled = currentPage <= 1;
    (nextBtn as HTMLButtonElement).disabled = currentPage >= totalPages;
  }

  private handleKeyboardShortcuts(e: KeyboardEvent): void {
    // Don't handle shortcuts if user is typing in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Handle shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          this.saveAnnotations(); // Ctrl+S should perform a quick local save
          break;
      }
    } else {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.pdfViewer?.prevPage().then(() => { this.updatePageInfo(); this.sequencePanel.render(); });
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.pdfViewer?.nextPage().then(() => { this.updatePageInfo(); this.sequencePanel.render(); });
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          const selectedAnnotation = annotationStore.getStore().selectedAnnotation;
          if (selectedAnnotation) {
            annotationStore.deleteAnnotation(selectedAnnotation.id);
          }
          break;
      }
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new App();
});

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
