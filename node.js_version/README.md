# Legacy Code Modernizer — Rosetta Stone (Node.js)

AI-powered conversion of legacy scripts to modern automation formats.
Works in every browser: Chrome, Firefox, Safari, Edge.

---

## Project layout

  server.js          — Express server (AI proxy, file I/O, directory scanning)
  public/index.html  — Frontend (served by the Node server)
  package.json       — Dependencies (express, dotenv, multer)
  .env.example       — Copy to .env and fill in your API key
  .gitignore         — Excludes .env and node_modules

---

## Quick start

  1. Install dependencies
       npm install

  2. Set up your API key
       cp .env.example .env
       # Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

  3. Start the server
       npm start

  4. Open in any browser
       http://localhost:3000

---

## .env configuration

  ANTHROPIC_API_KEY=sk-ant-api03-your-key-here   # Required for Anthropic
  PORT=3000                                        # Optional, default 3000
  OLLAMA_BASE_URL=http://localhost:11434           # Optional, for Ollama

The API key never leaves the server. The browser only talks to /api/* endpoints
on your local machine — no key is ever sent to the frontend.

---

## Running with Ollama instead of Anthropic

  1. Install Ollama: https://ollama.ai
  2. Pull a model:   ollama pull qwen2.5-coder
  3. Start Ollama:   ollama serve
  4. In the app Settings panel, switch to "Ollama (local)"
  5. Set the model name to match what you pulled

To use your custom modelfile from the repo:
  ollama create legacy2ansible -f ../Model-files/legacy2ansible.modelfile
  # Then set model name to "legacy2ansible" in Settings

---

## Features

  Single file mode   — paste code, generate docs + tests + converted output
  Batch mode         — type a server-side directory path to scan it,
                       or drag-and-drop files (works in all browsers)
  Output directory   — type a server-side path; outputs auto-save there
  Complexity scoring — 0-100 pre-assessment with specific blocker warnings
  TODO injection     — unfixable sections get # TODO: MANUAL REVIEW comments
  Batch summary      — stat cards + per-file table + CSV export

---

## API endpoints

  GET  /api/health          Server status + key presence check
  POST /api/scan-dir        Scan a server-side directory for legacy files
  POST /api/read-file       Read a file's content from the server filesystem
  POST /api/save-outputs    Write docs/tests/converted to a server directory
  POST /api/upload          Upload files from the browser (multipart)
  POST /api/ai              AI proxy — streams SSE back to the browser

---

## Development (auto-restart on file changes)

  npm run dev

Requires Node.js 18+. No global installs needed beyond Node itself.

---

## Security notes

  - ANTHROPIC_API_KEY is read from .env on startup and never exposed to clients
  - .env is git-ignored
  - The server only reads/writes paths you explicitly provide — no chrooting
  - For production/team use, add authentication middleware to server.js

---

Built for Red Hat Conference 2026 · Atlanta
