import { PdfViewer } from './components/PdfViewer.js';
import { FileManager } from './components/FileManager.js';
import { annotationStore } from './store/annotationStore.js';
import { pdfService } from './services/pdfService.js';

class App {
  private pdfViewer: PdfViewer | null = null;
  private currentJson: string = '';

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
                <div id="save-status" class="text-sm text-gray-600"></div>
                <button id="save-btn" class="btn-primary">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                  </svg>
                  Save
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
  }

  private setupEventListeners(): void {
    const saveBtn = document.getElementById('save-btn')!;
    const prevBtn = document.getElementById('prev-page')!;
    const nextBtn = document.getElementById('next-page')!;

    saveBtn.addEventListener('click', () => this.saveAnnotations());
    prevBtn.addEventListener('click', async () => {
      await this.pdfViewer?.prevPage();
      this.updatePageInfo();
    });
    nextBtn.addEventListener('click', async () => {
      await this.pdfViewer?.nextPage();
      this.updatePageInfo();
    });
    
    // Auto-save event listener
    window.addEventListener('autoSaveRequested', () => {
      if (this.currentJson && annotationStore.getStore().isDirty) {
        this.saveAnnotations();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  private setupStoreSubscription(): void {
    annotationStore.subscribe((store) => {
      const saveBtn = document.getElementById('save-btn')!;
      const saveStatus = document.getElementById('save-status')!;
      
      (saveBtn as HTMLButtonElement).disabled = !store.isDirty || store.isSaving;
      
      if (store.isSaving) {
        saveStatus.textContent = 'Saving...';
      } else if (store.lastSaved) {
        saveStatus.textContent = `Last saved: ${store.lastSaved.toLocaleTimeString()}`;
      } else {
        saveStatus.textContent = '';
      }
    });
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

  private async saveAnnotations(): Promise<void> {
    if (!this.currentJson) {
      alert('Please select a JSON file first');
      return;
    }

    try {
      await annotationStore.saveAnnotations(this.currentJson);
    } catch (error) {
      console.error('Failed to save annotations:', error);
      alert('Failed to save annotations');
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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    // Handle shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          this.saveAnnotations();
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
