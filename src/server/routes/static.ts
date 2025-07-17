import { Router } from 'express';
import path from 'path';
import { FileService } from '../services/fileService.js';

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const fileService = new FileService();

// Serve PDF files
router.get('/pdfs/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = fileService.getPdfPath(filename);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'PDF file not found' });
    }
  });
});

// Serve JSON files
router.get('/output/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = fileService.getOutputPath(filename);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'JSON file not found' });
    }
  });
});

// Serve static files from public directory
router.use('/static', (req, res, next) => {
  const publicPath = path.join(process.cwd(), 'public');
  res.sendFile(path.join(publicPath, req.path), (err) => {
    if (err) {
      next();
    }
  });
});

export default router;
