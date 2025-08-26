import * as pdfjsLib from 'pdfjs-dist';

export class PdfService {
  private pdf: pdfjsLib.PDFDocumentProxy | null = null;
  private textCache: Map<string, Awaited<ReturnType<pdfjsLib.PDFPageProxy['getTextContent']>>> = new Map();

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
    this.textCache.clear();
  }

  getTotalPages(): number {
    return this.pdf?.numPages || 0;
  }

  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.5,
    rotation: number = 0
  ): Promise<{ width: number; height: number; scale: number; rotation: number }> {
    if (!this.pdf) {
      throw new Error('No PDF loaded');
    }

    const page = await this.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });

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
      scale,
      rotation,
    };
  }

  async getPage(pageNumber: number): Promise<pdfjsLib.PDFPageProxy> {
    if (!this.pdf) {
      throw new Error('No PDF loaded');
    }
    return this.pdf.getPage(pageNumber);
  }

  async getTextContent(
    pageNumber: number
  ): Promise<Awaited<ReturnType<pdfjsLib.PDFPageProxy['getTextContent']>>> {
    if (!this.pdf) {
      throw new Error('No PDF loaded');
    }
    const key = `${pageNumber}:default`;
    if (this.textCache.has(key)) return this.textCache.get(key)!;

    const page = await this.pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    this.textCache.set(key, text);
    return text;
  }
}

export const pdfService = new PdfService();
