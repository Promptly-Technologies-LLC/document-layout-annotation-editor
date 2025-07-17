# PDF Annotation Editor v2.0

A modern, feature-rich PDF annotation editor built with TypeScript, Express, and Vite. This application allows users to view PDF documents and create/edit annotations with a clean, responsive interface.

## Features

- **Modern Architecture**: Built with TypeScript for type safety and better developer experience
- **Responsive Design**: Clean, modern UI with Tailwind CSS
- **Real-time Updates**: Live preview of annotations as you create them
- **Drag & Drop**: Intuitive annotation creation and manipulation
- **Auto-save**: Automatic saving with debouncing
- **File Management**: Easy selection of PDF and JSON files
- **Keyboard Shortcuts**: Navigate pages and save with keyboard shortcuts
- **Error Handling**: Comprehensive error handling with user-friendly messages

## Architecture

The application follows a modern, modular architecture:

```
src/
├── server/          # Express server with TypeScript
├── client/          # Frontend application
│   ├── components/  # Reusable UI components
│   ├── services/    # API and PDF services
│   ├── store/       # State management
│   └── styles/      # CSS and styling
└── shared/          # Shared types and utilities
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create the required directories:
   ```bash
   mkdir pdfs output
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

This will start:
- Backend server on http://localhost:3001
- Frontend dev server on http://localhost:3000

### Usage

1. **Add PDFs**: Place PDF files in the `pdfs/` directory
2. **Create JSON**: The app will create JSON files in the `output/` directory
3. **Annotate**: Select a PDF and JSON file, then click and drag to create annotations
4. **Save**: Changes are auto-saved, or use the Save button

### Development

- **Server**: `npm run dev:server` - Runs the Express server with hot reload
- **Client**: `npm run dev:client` - Runs Vite dev server
- **Build**: `npm run build` - Builds for production
- **Preview**: `npm run preview` - Preview production build

### API Endpoints

- `GET /api/files` - List available PDF and JSON files
- `POST /api/save-json` - Save annotations to JSON file
- `GET /pdfs/:filename` - Serve PDF files
- `GET /output/:filename` - Serve JSON files

## Technology Stack

- **Backend**: Express.js with TypeScript
- **Frontend**: Vanilla TypeScript with Vite
- **Styling**: Tailwind CSS
- **PDF Rendering**: PDF.js
- **Build Tools**: Vite, TypeScript, ESLint, Prettier

## Improvements over v1

- ✅ TypeScript for type safety
- ✅ Modern build tools (Vite instead of vanilla HTML/JS)
- ✅ Component-based architecture
- ✅ State management with reactive store
- ✅ Better error handling
- ✅ Responsive design
- ✅ Auto-save functionality
- ✅ Modern UI with Tailwind CSS
- ✅ Proper file structure
- ✅ Development tooling (hot reload, linting, formatting)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details
