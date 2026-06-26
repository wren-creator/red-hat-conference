# Sovereign AI Mode — Quickstart Guide

Run Rosetta Stone with zero cloud calls, zero API keys, and no data leaving your machine. This guide covers the minimum steps to get operational in an offline or air-gapped environment.

---

## What Sovereign AI Mode Does

When enabled, the app:
- Locks to **Ollama only** — cloud providers (Anthropic, OpenAI, Gemini) are disabled and greyed out
- Displays a banner confirming that all processing is local
- Shows model recommendations sized for your hardware
- Runs a pre-flight check before every conversion to confirm Ollama is reachable and your chosen model is loaded

No data ever leaves the machine. There is no telemetry, no analytics, no API calls to any external service.

---

## Step 1 — Install Ollama

**macOS / Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download and run the installer from [ollama.com](https://ollama.com).

Verify the install:
```bash
ollama --version
```

---

## Step 2 — Pull a Model

Choose based on your available RAM:

| Model | RAM needed | Use when |
|---|---|---|
| `qwen2.5-coder:32b` | 24 GB+ | Best output quality — production migrations |
| `qwen2.5-coder:14b` | 16 GB+ | Best balance — recommended for most setups |
| `qwen2.5-coder:7b` | 8 GB+ | Fast — demos, smaller scripts, constrained hardware |
| `deepseek-coder-v2:16b` | 24 GB+ | Strong alternative for COBOL and complex legacy code |

```bash
ollama pull qwen2.5-coder:14b
```

This downloads the model once. After that it runs fully offline.

---

## Step 3 — Start Ollama

**Standard (serving from localhost):**
```bash
ollama serve
```

**If serving from a non-localhost origin** (e.g. GitHub Pages or a network URL):
```bash
OLLAMA_ORIGINS="https://your-origin.example.com" ollama serve
```

If you're running the app from `launch.py` on localhost, you do not need to set `OLLAMA_ORIGINS` — localhost is trusted by default.

---

## Step 4 — Launch the App

**Option A — Python server (recommended):**
```bash
python3 launch.py
```
This opens `http://localhost:8000` automatically. Ollama at `http://localhost:11434` is detected automatically.

**Option B — Open directly:**
Double-click `index.html` in Chrome or Edge. No server needed.

---

## Step 5 — Enable Sovereign AI Mode

1. Click **⚙ Settings** in the top-right header
2. Toggle **Sovereign AI Mode** on
3. The banner at the top of the page confirms local-only mode is active
4. Select your model from the dropdown (or use the model recommendations shown in the settings panel)
5. Click **Test & load models** to verify Ollama is connected

---

## Verifying the Connection

If Ollama does not connect:

1. Open **🔬 Diagnostics** → **Auto-Detect** tab — this shows live status for all providers
2. The Ollama section shows: reachability, key/auth status, and model availability
3. If you see a CORS error and are running from a non-localhost URL, copy the `OLLAMA_ORIGINS` command shown in the settings panel and restart Ollama with it

---

## Air-Gapped Environments

For systems with no internet access at all:

1. Download Ollama and the model file on a networked machine first
2. Copy the Ollama binary and the model cache directory to the air-gapped system
   - Model cache is at `~/.ollama/models` on macOS/Linux
   - On Windows: `%USERPROFILE%\.ollama\models`
3. Install Ollama on the air-gapped system from the copied binary
4. The models will be available immediately without any download

---

## Hardware Sizing

For detailed hardware guidance — including Apple M-series vs. NVIDIA GPU sizing, quantization selection, and context window requirements for large COBOL/Fortran codebases — see [HARDWARE.md](HARDWARE.md).

Quick reference:

| Setup | Minimum RAM | Practical for |
|---|---|---|
| MacBook / workstation | 16 GB | Scripts up to ~5K lines with 14b model |
| Mac Studio M4 Max 64 GB | 64 GB | Scripts up to ~20K lines with 32b model |
| Mac Studio M4 Ultra 192 GB | 192 GB | Large COBOL/Fortran programs, 122b models |

---

## Choosing Quantization (Advanced)

When pulling a model manually with a specific quantization tag:

- **Q4_K_M** — recommended minimum for code tasks. The `_K_M` variant preserves key layers at higher precision, which matters for structured output like YAML and HCL.
- **Q5_K_M or Q8** — better quality if you have the RAM headroom. Noticeably improved on COBOL and REXX.
- **Q3 and below** — avoid for code conversion. Structured output (YAML, HCL, Go) degrades significantly.

```bash
# Pull with specific quantization
ollama pull qwen2.5-coder:14b-instruct-q4_K_M
```

---

*For questions, issues, or air-gapped deployment help, open an issue in the project repo.*
