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
              <div class="flex items-center space-x-4">
                <button id="seq-btn" class="btn-secondary">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                  </svg>
                  Order
                </button>
                <div id="status-text" class="text-sm text-gray-600"></div>
                <button id="sync-btn" class="btn-primary">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m-4-4l4-4 4 4"></path>
                  </svg>
                  Sync
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div id="file-manager" class="border-b"></div>
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
    const fileManagerContainer = document.getElementById('file-manager')!;
    const pdfViewerContainer = document.getElementById('pdf-viewer')!;

    new FileManager(fileManagerContainer, {
      onPdfSelected: (filename) => this.handlePdfSelected(filename),
      onJsonSelected: (filename) => this.handleJsonSelected(filename),
      onFilesRefreshed: (files) => console.log('Files refreshed:', files),
    });

    this.pdfViewer = new PdfViewer(pdfViewerContainer);
    this.sequencePanel = new SequencePanel(document.body);
  }

  private setupEventListeners(): void {
    const syncBtn = document.getElementById('sync-btn')!;
    const seqBtn = document.getElementById('seq-btn')!;
    const prevBtn = document.getElementById('prev-page')!;
    const nextBtn = document.getElementById('next-page')!;

    syncBtn.addEventListener('click', () => this.syncAnnotations());
    seqBtn.addEventListener('click', () => this.sequencePanel.toggle());
    prevBtn.addEventListener('click', async () => {
      await this.pdfViewer?.prevPage();
      this.updatePageInfo();
    });
    nextBtn.addEventListener('click', async () => {
      await this.pdfViewer?.nextPage();
      this.updatePageInfo();
    });
    
    // Auto-save event listener (This remains important for local saving)
    window.addEventListener('autoSaveRequested', () => {
      if (this.currentJson && annotationStore.getStore().isDirty) {
        // Just save locally, don't sync
        annotationStore.saveAnnotations(this.currentJson);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
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
    } catch (error) {
      console.error('Failed to load PDF:', error);
    }
  }

  private async handleJsonSelected(filename: string): Promise<void> {
    this.currentJson = filename;
    try {
      await annotationStore.loadAnnotations(filename);
    } catch (error) {
      console.error('Failed to load annotations:', error);
    }
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
          this.pdfViewer?.prevPage().then(() => this.updatePageInfo());
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.pdfViewer?.nextPage().then(() => this.updatePageInfo());
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
