# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a server-based PDF annotation editor application. The project provides tools for viewing and editing annotation data.

## Commands

### Development Server
- **Start development server:** `bun run dev` or `bun run server`
- **Start server:** `bun run server.js`

### API Testing
- **Single API call:** `./call_api.sh` (uses .env for API_KEY and API_URL)
- **Batch processing:** `./call_api.sh` (processes all PDFs in configured directories)

## Application Architecture

### Application Architecture
Server-based application (`index.html` + `server.js`):
- Serves files from local directories (`/pdfs`, `/output`)
- Auto-saves annotations to server
- Uses Express.js backend with CORS support
- API endpoints: `/api/save-json`, `/api/files`

### Key Components

**PDF Processing:**
- Uses PDF.js for client-side rendering
- Supports page navigation and responsive scaling
- Canvas-based rendering with annotation overlays

**Annotation System:**
- Interactive bounding boxes with drag/resize capability
- Label editing with click-to-edit functionality
- Coordinate system conversion between PDF points and screen pixels
- Data structure: defined in `schema.json`

**File Management:**
- PDFs stored in `./pdfs/` directory
- JSON annotations stored in `./output/` directory
- Server-based file listing and management

## Development Notes

- Uses Bun as the runtime (not Node.js)
- ES modules throughout
- No build step required - direct file serving
- Shell scripts use bash with strict error handling (`set -o nounset -o errexit -o pipefail`)
- If you do any testing, remember to run the development server in a detached terminal and to clean up when finished