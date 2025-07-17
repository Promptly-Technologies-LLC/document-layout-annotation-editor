import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Serve static files
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')))
app.use('/output', express.static(path.join(__dirname, 'output')))

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// API endpoint to save JSON files
app.post('/api/save-json', async (req, res) => {
  try {
    const { filename, data } = req.body
    
    if (!filename || !data) {
      return res.status(400).json({ error: 'Missing filename or data' })
    }
    
    // Ensure the filename is safe and within the output directory
    const safeName = path.basename(filename)
    const outputPath = path.join(__dirname, 'output', safeName)
    
    // Create output directory if it doesn't exist
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
    } catch (err) {
      // Directory might already exist
    }
    
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2))
    
    res.json({ 
      success: true, 
      message: `Saved ${safeName}`,
      path: outputPath
    })
  } catch (error) {
    console.error('Error saving file:', error)
    res.status(500).json({ 
      error: 'Failed to save file', 
      details: error.message 
    })
  }
})

// API endpoint to list available files
app.get('/api/files', async (_, res) => {
  try {
    const pdfsDir = path.join(__dirname, 'pdfs')
    const outputDir = path.join(__dirname, 'output')
    
    let pdfFiles = []
    let jsonFiles = []
    
    try {
      const pdfDirContents = await fs.readdir(pdfsDir)
      pdfFiles = pdfDirContents.filter(f => f.endsWith('.pdf'))
    } catch (err) {
      console.log('pdfs directory not found, creating it...')
      await fs.mkdir(pdfsDir, { recursive: true })
    }
    
    try {
      const outputDirContents = await fs.readdir(outputDir)
      jsonFiles = outputDirContents.filter(f => f.endsWith('.json'))
    } catch (err) {
      console.log('output directory not found, creating it...')
      await fs.mkdir(outputDir, { recursive: true })
    }
    
    res.json({ pdfFiles, jsonFiles })
  } catch (error) {
    console.error('Error listing files:', error)
    res.status(500).json({ error: 'Failed to list files' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log('Put PDFs in ./pdfs/ and JSON files in ./output/')
})