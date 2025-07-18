import * as pdfjsLib from 'pdfjs-dist';

export class PdfService {
  private pdf: pdfjsLib.PDFDocumentProxy | null = null;

  constructor() {
    // Configure PDF.js worker to use local worker file
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  async loadPdf(url: string): Promise<void> {
    const loadingTask = pdfjsLib.getDocument(url);
    this.pdf = await loadingTask.promise;
  }

  getTotalPages(): number {
    return this.pdf?.numPages || 0;
  }

  async renderPage(pageNumber: number, canvas: HTMLCanvasElement): Promise<{ width: number; height: number }> {
    if (!this.pdf) {
      throw new Error('No PDF loaded');
    }

    const page = await this.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: canvas.getContext('2d')!,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    return {
      width: viewport.width,
      height: viewport.height,
    };
  }
}

export const pdfService = new PdfService();
