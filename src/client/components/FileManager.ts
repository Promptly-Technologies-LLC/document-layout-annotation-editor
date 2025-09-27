import { apiService } from '../services/api.js';
import type { FileListResponse } from '../../shared/types/annotation.js';

export interface FileManagerEvents {
  onPdfSelected: (filename: string) => void;
  onJsonSelected: (filename: string) => void;
  onFilesRefreshed: (files: FileListResponse) => void;
}

export class FileManager {
  private container: HTMLElement;
  private pdfSelect!: HTMLSelectElement;
  private jsonSelect!: HTMLSelectElement;
  private refreshBtn!: HTMLButtonElement;
  private events: FileManagerEvents;

  constructor(container: HTMLElement, events: FileManagerEvents) {
    this.container = container;
    this.events = events;
    this.setupElements();
    this.setupEventListeners();
    this.loadFiles();
  }

  private setupElements(): void {
    this.container.innerHTML = `
      <div class="flex items-center space-x-4">
        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-700">PDF:</label>
          <select class="select w-48" id="pdf-select">
            <option value="">Select PDF...</option>
          </select>
        </div>
        
        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-700">JSON:</label>
          <select class="select w-48" id="json-select">
            <option value="">Select JSON...</option>
          </select>
        </div>
        
        <button class="btn-secondary" id="refresh-files">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Refresh
        </button>

        <div id="status-text" class="text-sm text-gray-600"></div>
        <button id="sync-btn" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m-4-4l4-4 4 4"></path>
          </svg>
          Sync
        </button>
      </div>
    `;

    this.pdfSelect = this.container.querySelector('#pdf-select')!;
    this.jsonSelect = this.container.querySelector('#json-select')!;
    this.refreshBtn = this.container.querySelector('#refresh-files')!;
  }

  private setupEventListeners(): void {
    this.pdfSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value) {
        this.events.onPdfSelected(target.value);
      }
    });

    this.jsonSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value) {
        this.events.onJsonSelected(target.value);
      }
    });

    this.refreshBtn.addEventListener('click', () => this.loadFiles());
  }

  async loadFiles(): Promise<void> {
    console.log('Loading files from server...');
    try {
      const files = await apiService.getFiles();
      console.log('Files loaded:', files);
      this.populateSelects(files);
      this.events.onFilesRefreshed(files);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  }

  private populateSelects(files: FileListResponse): void {
    this.pdfSelect.innerHTML = '<option value="">Select PDF...</option>';
    this.jsonSelect.innerHTML = '<option value="">Select JSON...</option>';

    files.pdfFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file;
      this.pdfSelect.appendChild(option);
    });

    files.jsonFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file;
      this.jsonSelect.appendChild(option);
    });
  }

  setSelectedPdf(filename: string): void {
    this.pdfSelect.value = filename;
  }

  setSelectedJson(filename: string): void {
    this.jsonSelect.value = filename;
  }
}
