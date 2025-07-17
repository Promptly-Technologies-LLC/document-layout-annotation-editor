import { promises as fs } from 'fs';
import path from 'path';
import { Annotation, FileInfo } from '../../shared/types/annotation.js';

export class FileService {
  private readonly pdfsDir: string;
  private readonly outputDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.pdfsDir = path.join(baseDir, 'pdfs');
    this.outputDir = path.join(baseDir, 'output');
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.pdfsDir, { recursive: true });
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async listFiles(): Promise<{ pdfFiles: string[]; jsonFiles: string[] }> {
    await this.ensureDirectories();

    const [pdfFiles, jsonFiles] = await Promise.all([
      this.listFilesInDirectory(this.pdfsDir, '.pdf'),
      this.listFilesInDirectory(this.outputDir, '.json'),
    ]);

    return { pdfFiles, jsonFiles };
  }

  private async listFilesInDirectory(dir: string, extension: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir);
      return files
        .filter(file => file.endsWith(extension))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  async saveAnnotations(filename: string, data: Annotation[]): Promise<string> {
    await this.ensureDirectories();
    
    const safeName = this.sanitizeFilename(filename);
    const filePath = path.join(this.outputDir, safeName);
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    return filePath;
  }

  async loadAnnotations(filename: string): Promise<Annotation[]> {
    const safeName = this.sanitizeFilename(filename);
    const filePath = path.join(this.outputDir, safeName);
    
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Annotation[];
  }

  async getFileInfo(filename: string, type: 'pdf' | 'json'): Promise<FileInfo> {
    const dir = type === 'pdf' ? this.pdfsDir : this.outputDir;
    const filePath = path.join(dir, this.sanitizeFilename(filename));
    
    const stats = await fs.stat(filePath);
    
    return {
      name: filename,
      size: stats.size,
      lastModified: stats.mtime,
      type: type
    };
  }

  private sanitizeFilename(filename: string): string {
    return path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  getPdfPath(filename: string): string {
    return path.join(this.pdfsDir, this.sanitizeFilename(filename));
  }

  getOutputPath(filename: string): string {
    return path.join(this.outputDir, this.sanitizeFilename(filename));
  }
}
