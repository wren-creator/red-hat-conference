# Legacy Code Modernizer — Rosetta Stone

AI-powered tool to convert legacy scripts (Bash, Perl, COBOL, Fortran, AWK, Tcl, csh)
into modern formats (Ansible YAML, Python 3, Terraform HCL, Go, PowerShell).

---

## What's in this folder

  index.html   — The entire application (single file)
  launch.py            — Optional Python launch script
  README.txt           — This file

---

## How to run

### Option A — Open directly in Chrome or Edge (simplest)
Double-click index.html, or drag it into Chrome/Edge.

NOTE: The File System Access API (directory picker, drag-and-drop folders,
output directory save) requires Chrome 86+ or Edge 86+. Firefox has limited
support. Single-file paste mode works in any modern browser.

### Option B — Python local server (recommended for full file access)
Requires Python 3.6+. No pip installs.

  python3 launch.py

Then open: http://localhost:8000/index.html

To use a different port:
  python3 launch.py --port 8080

---

## First-time setup

1. Open the app in Chrome or Edge
2. Click the Settings button (top right)
3. Choose your AI provider:

   ANTHROPIC API
   - Enter your API key (get one at https://console.anthropic.com)
   - Choose your model (Sonnet 4 recommended for balance of speed/quality)
   - Click "Save key" — stored in your browser's localStorage on this machine only
   - Click "Test connection" to verify

   OLLAMA (local, no API key needed)
   - Install Ollama from https://ollama.ai
   - Pull a code model:  ollama pull qwen2.5-coder
   - Start Ollama with CORS enabled:
       OLLAMA_ORIGINS=* ollama serve
   - In Settings, set URL to http://localhost:11434
   - Set model name to match what you pulled (e.g. qwen2.5-coder)
   - Click "Test connection"

---

## Using the app

SINGLE FILE MODE
- Paste code into the text area (or click "load sample" to try an example)
- Select source and target languages
- Click Generate

BATCH / DIRECTORY MODE
- Click "Directory / batch" tab
- Load files via: Pick directory, Pick files, or drag and drop
- Optionally choose an output directory — results auto-save there
- Click Process queue

OUTPUTS (for each file)
- Documentation tab  — purpose, inputs, outputs, logic walkthrough, migration notes
- Test script tab     — pytest / Go test / bash tests covering all behaviors
- Converted code tab  — idiomatic target-language code with TODO comments where
                         manual review is required

COMPLEXITY SCORING
Each file is assessed 0-100 before conversion:
  0-33  (green)  — Clean, fully automatable
  34-66 (amber)  — Partial, review recommended
  67-100 (red)   — Manual intervention required

Files flagged red will have # TODO: MANUAL REVIEW comments inserted in the
converted output at exact locations needing human attention.

BATCH SUMMARY
After batch processing, a summary panel shows:
- Counts of clean / needs-review / manual-required files
- Per-file breakdown table
- Export to CSV button

---

## Privacy & security

- Your API key is held IN MEMORY ONLY inside the browser tab.
- The key is NEVER written to disk, localStorage, cookies, or any server.
- The key is automatically cleared the moment you close the tab.
- Code you paste is sent to Anthropic's API (or your local Ollama) for processing only.
- Nothing is sent to any other server.
- Non-sensitive preferences (provider choice, model name, Ollama URL) are saved
  to localStorage so you don't have to re-enter them each session.
- Use "Clear key from memory" in Settings to wipe the key mid-session if needed.

---

## Requirements

- Chrome 86+ or Edge 86+ (for full file system features)
- Python 3.6+ (only if using launch.py)
- Internet connection (for Anthropic API) OR local Ollama install

---

Built for Red Hat Conference 2026 · Atlanta
