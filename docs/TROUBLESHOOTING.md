# Troubleshooting Guide — Rosetta Stone

This guide covers how to use the built-in **Diagnostics panel** and **Settings** tools to identify and resolve issues with the Legacy Code Modernizer. Written for conference demo scenarios where you need to diagnose and fix problems fast, but applies equally to day-to-day use.

---

## Quick Start: Where to Look First

Two buttons live in the top-right header:

- **⚙ Settings** — provider configuration, API keys, model selection, generation options
- **🔬 Diagnostics** — live signal board, auto-detect, and activity log

If something isn't working, open **Diagnostics** first. The signal board and auto-detect tabs will almost always tell you what's wrong within a few seconds.

---

## The Diagnostics Panel

### Opening and Using It

Click **🔬 Diagnostics** in the header. The panel opens below the header, the same way Settings does. It has three tabs:

1. **Signal Board** — live health signals updated after each run
2. **Auto-Detect** — per-provider status checks run automatically
3. **Activity Log** — timestamped log of every API call and event

The **↺ Re-check now** button in the top-right of the panel triggers a fresh auto-detect cycle on demand.

---

## Tab 1: Signal Board

The signal board appears after your first conversion run. Before that, it shows a placeholder — this is intentional. Once populated, it shows 10 labeled status dots that update live after every generation step.

### Reading the dots

Each dot is one of four states:

| Color | Meaning |
|---|---|
| 🟢 Green (solid) | Signal healthy |
| 🟡 Amber (pulsing) | Warning — investigate |
| 🔴 Red (pulsing fast) | Error — action required |
| ⚫ Grey | Not yet checked or not applicable |

The **banner at the top** of the board summarizes the overall state:

- **"All signals green"** — everything is working
- **"Warning — review amber signals below"** — something is slow or marginal
- **"Issue detected — check red signals below"** — something is broken

Below the banner you'll see session stats: number of requests, error count, and average response time.

### Signal definitions

**API / server reachable**
Whether the provider's endpoint responded at all. Red here means a network-level failure — either you're offline, the provider is down, or Ollama isn't running.

**Auth / key accepted**
Whether your API key was accepted. Red here almost always means the key is wrong, expired, or was entered with extra whitespace. Grey means no attempt has been made yet.

*If this turns red for Anthropic:* Open Settings, check the key starts with `sk-ant-api03-`, and use the Show button to verify there's no trailing space.

**Model confirmed**
Displays the model name used for the last request. Grey until a request is made. If you see an unexpected model name here, check your Settings → Model dropdown.

**Response time**
Duration of the last completed request.
- Green = under 8 seconds
- Amber = over 8 seconds (model may be under load or your input is large)
- Red = the request failed and no duration was recorded

*If consistently amber on Ollama:* Your local model may be underpowered for the script size. Try switching to a smaller model, reducing max tokens in Settings, or splitting large scripts.

**Stream health**
Whether the streaming response completed cleanly. Red here usually means the connection dropped mid-response or the model stopped generating unexpectedly.

**Token headroom**
Estimated tokens remaining before hitting your max_tokens limit. Calculated as `max_tokens - estimated_input_tokens`.
- Green = comfortable headroom
- Amber = less than ~600 tokens remaining
- Red = input likely exceeds the max_tokens setting — output will be truncated

*If this turns red:* Increase **Max tokens per request** in Settings → Generation options, or switch to a model with a larger context window.

**Last response complete**
Whether the last response ended normally (the stream finished, not errored). Amber or red here often pairs with a truncated output — the generated code or documentation may be cut off mid-sentence.

**Output validity**
Whether the response contained usable content (non-empty, non-whitespace). Red means the model returned an empty response — this can happen if the model is overloaded, the prompt was rejected, or the key hit a usage limit.

**Error count**
Cumulative errors this session.
- Green = 0 errors
- Amber = 1–2 errors (something went wrong but recovered)
- Red = 3+ errors (systematic problem — check the activity log)

**Rate limit**
Whether any HTTP 429 (too many requests) responses were received. Green means no rate limiting. Red means you've hit the provider's rate limit — wait a minute before retrying, or switch to Ollama for local processing.

---

## Tab 2: Auto-Detect

Auto-Detect runs automatically when the diagnostics panel is opened and after every conversion run. You can also trigger it manually with **↺ Re-check now**.

It checks all four providers simultaneously and shows their status side by side. The currently active provider is highlighted with a green border and an **active** badge. Non-active providers show **not active**.

### What each provider card shows

**Anthropic**
- *Key in memory* — whether a key has been entered this session (shows masked `sk-ant-…XXXX`)
- *Format valid* — whether the key starts with `sk-ant-` (catches copy-paste errors)
- *API reachable* — live ping to `api.anthropic.com` (shows HTTP status code and latency)
- *Model* — which model is currently selected

**Ollama**
- *Server running* — live ping to your Ollama URL's `/api/tags` endpoint
- *Model found* — whether the selected model name is in the list of pulled models
- *Available models* — lists the first 3 pulled models (e.g. `qwen2.5-coder, llama3, …`)
- *URL* — the configured Ollama base URL

**OpenAI**
- *Key in memory* — whether a key has been entered (masked `sk-…XXXX`)
- *API reachable* — live ping to `api.openai.com`
- *Model* — currently selected model

**Gemini**
- *Key in memory* — whether a key has been entered (masked `AIza…XXXX`)
- *API reachable* — live ping to the Gemini API
- *Model* — currently selected model

### Using Auto-Detect before a demo

Open Diagnostics → Auto-Detect a few minutes before presenting. You want to see:

- Your intended provider card highlighted as **active** with a green border
- *API reachable* showing a green dot and a response time (e.g. `200 OK (340ms)`)
- For Ollama: *Server running* green and *Model found* green (not "not found ✗")

If you see red on any of those, use the guidance below to fix it before you're in front of an audience.

---

## Tab 3: Activity Log

The activity log runs from page load regardless of whether the Diagnostics panel is open. Every API call, model load, provider switch, and error is appended with:

- **Timestamp** (HH:MM:SS)
- **Level** — OK (green), INFO (blue), WARN (amber), ERR (red)
- **Message** — what happened, including error text
- **Duration** — how long the operation took in milliseconds

### Reading the log

Look at the most recent entries first. ERR rows show the full error message from the provider — this is often more specific than what the UI displays. Example entries:

```
10:23:14  OK    Loaded 3 Ollama model(s)                            —
10:23:18  INFO  Provider switched to: anthropic                     —
10:24:02  ERR   anthropic error: 401 {"type":"error",...}           12ms
10:24:18  INFO  Run started · Bash → Ansible YAML · ~340 est. tokens
10:24:31  OK    anthropic · 13.2s · ~1840 tokens                    13200ms
```

### Exporting the log

The **Export log** button (top-right of the Activity Log tab) downloads the full session log as a plain `.txt` file. Share this when opening an issue — it contains everything needed to reproduce the problem.

---

## Common Issues and Fixes

### Nothing happens when I click Generate

1. Open Diagnostics → Signal Board. If it shows placeholder text, no run has been attempted yet — check that you've pasted code into the text area or added files to the queue.
2. Check the status row below the Generate button — it may show an error message.
3. Open the Activity Log and look for the most recent ERR row.

---

### "No Anthropic API key set" error

Open **Settings → Provider → Anthropic**. Enter your key in the API Key field. The key should start with `sk-ant-api03-`. Click **Test connection** to verify before running a conversion.

The key is held in memory only — it is cleared when the tab is closed. You'll need to re-enter it each session.

---

### Anthropic returns a 401 Unauthorized error

Signal board: **Auth / key accepted** turns red.

Causes and fixes:
- **Wrong key** — double-check at [console.anthropic.com](https://console.anthropic.com) → API Keys
- **Extra whitespace** — click Show in the key field and verify there's no leading or trailing space
- **Key format** — the key must start with `sk-ant-api03-`, not `sk-ant-` or any other prefix
- **Usage limit reached** — check your billing at console.anthropic.com

---

### Anthropic returns a 429 rate limit error

Signal board: **Rate limit** turns red.

You've exceeded Anthropic's API rate limit for your tier. Options:
- Wait 60 seconds and retry
- Use **Batch delay** in Settings to add a pause between files during batch processing (2 seconds is rate-limit safe)
- Switch to Ollama for local processing during the delay

---

### Ollama is not connecting

Auto-Detect: **Server running** shows a red dot and "not running ✗".

**Step 1 — Is Ollama running?**
```bash
ollama serve
```
Ollama must be running for the app to connect. Check your terminal for errors.

**Step 2 — Is the URL correct?**
Open Settings → Ollama fields. The default URL is `http://localhost:11434`. If you're running Ollama on a different port or a remote machine, update it here.

**Step 3 — CORS issue?**
If you're accessing the app from a non-localhost origin (GitHub Pages, a remote server, or any non-`localhost` URL), Ollama blocks browser requests by default. You must start Ollama with your page's origin explicitly allowed:

```bash
# For GitHub Pages
OLLAMA_ORIGINS="https://wren-creator.github.io" ollama serve

# For any origin (use only on a trusted machine/network)
OLLAMA_ORIGINS="*" ollama serve
```

The app's **Ollama Probe** button (Settings → Ollama fields → "Test & load models") will show you the exact CORS status and generate the correct command for your origin.

**Step 4 — No models pulled?**
Auto-Detect may show "Server running ✓" but "model not found ✗". You need to pull at least one model:

```bash
ollama pull qwen2.5-coder     # recommended for code tasks
ollama pull llama3             # good general alternative
```

After pulling, click **↺ Retry fetch** in Settings → Ollama fields, or **↺ Re-check now** in Diagnostics to refresh the model list.

---

### Ollama model not found

Auto-Detect: **Server running** is green, but **Model found** shows "modelname ✗ not found".

The model name selected in Settings doesn't match any model currently pulled in your Ollama instance. Either:

- Pull the model: `ollama pull <model-name>`
- Or select a different model from the dropdown (which shows the models actually available)

The dropdown auto-populates from your Ollama instance. If it shows stale data, click **↺ Retry fetch**.

---

### Output is cut off mid-sentence or mid-code

Signal board: **Token headroom** turns amber or red, **Last response complete** may turn amber.

Your input script is using most of the token budget, leaving little room for the output. Fix:

1. Open **Settings → Generation options**
2. Increase **Max tokens per request** — try 2000 or 4000 for large files
3. For very large scripts with Ollama: the app auto-expands the context window up to 16K tokens. If the script exceeds that, a red banner will appear and recommend switching to a cloud provider.

---

### "Script too large for Ollama" red banner

A red banner appears in the main card before the Generate button. This means the estimated token count exceeds the safe context limit for your Ollama model.

Options:
- Split the script into smaller logical sections and process separately
- Switch to Anthropic (200K context) or Gemini (1M context) via Settings

---

### Models dropdown is empty or shows "Connecting to Ollama…"

The app couldn't reach Ollama's `/api/tags` endpoint. See the Ollama connection steps above.

If Ollama is running but CORS is blocking, the dropdown falls back to a text input so you can type a model name manually — this lets you proceed even without model auto-detection.

---

### OpenAI or Gemini models not loading

Models load from the API automatically after you enter your key. If the dropdown stays blank or shows static defaults:

1. Verify the key is correct and has API access enabled
2. Check your network — the app must be able to reach the provider's model list endpoint
3. Look at the Activity Log for the specific error message

---

### Responses are very slow

Signal board: **Response time** turns amber (>8 seconds consistently).

For Ollama:
- The model may be running on CPU. Check `ollama ps` — if you see no GPU usage, consider a smaller model (`qwen2.5-coder:3b` instead of `7b`)
- Increase **Max tokens** in Settings only as much as needed — larger max_tokens slows inference even if the response is short
- Check system resources — running other heavy processes alongside Ollama will slow it down

For cloud providers (Anthropic, OpenAI, Gemini):
- The provider may be under load — retry in a minute
- Try a faster model: claude-haiku-4-5, gpt-4o-mini, or gemini-1.5-flash are the fastest options in each family
- Large scripts take longer to process — the complexity assessment step adds an extra round trip before the main conversion

---

### The connection test passes but the actual conversion fails

The **Test connection** button sends a minimal one-sentence test request. A passing test only confirms the key and model are valid — it doesn't test the full prompt. Failures during real conversions can still happen if:

- The script content triggers a content filter (uncommon but possible with obscure code patterns)
- The request exceeds the provider's per-request size limit
- A rate limit is hit between the test and the conversion
- The stream connection drops mid-response (check **Stream health** in the signal board)

Check the Activity Log for the specific error text from the provider.

---

### Complexity score seems wrong

The complexity assessment is a separate AI call that runs before the main conversion. It can occasionally underestimate complexity for unusual code patterns. You can:

- Set **Skip complexity assessment** to Yes in Settings if you want to skip it entirely
- Treat the score as a rough guide, not a guarantee — always review the converted output

---

### Batch processing stops mid-queue

If the queue stops processing partway through, check:

1. **Activity Log** — look for ERR rows matching the stopped file
2. **Rate limiting** — if you see 429 errors, increase **Batch delay** in Settings to 2 seconds
3. **File size** — a file that's too large for Ollama's context will be marked as error and skipped, but processing continues for the rest of the queue
4. The **queue-item badge** for each file shows its state: queued / processing / done / needs review / error

---

## Demo Preparation Checklist

Use this before presenting at a conference or live session:

```
[ ] Provider selected in Settings matches what you intend to demo
[ ] API key entered and "Test connection" returns success
[ ] For Ollama: ollama serve is running with correct OLLAMA_ORIGINS set
[ ] Open Diagnostics → Auto-Detect — active provider card shows green API reachable
[ ] Load a sample script (click "load sample →") and do a full test run
[ ] Signal board shows all green after the test run
[ ] Activity log shows no ERR rows
[ ] For batch mode: output directory is set and writable
[ ] Hard refresh the browser (Ctrl+Shift+R) to clear any cached assets
```

---

## Exporting Diagnostic Data

The **Export log** button in the Activity Log tab downloads the full session log as a `.txt` file. Include this when:
- Opening a GitHub issue
- Sharing a reproducible bug with a collaborator
- Recording what happened during a failed demo for post-mortem review

The log format is plain text, one entry per line:
```
[HH:MM:SS] [LEVEL] message (Xms)
```

---

## Getting Help

- **GitHub Issues:** Open an issue at `wren-creator/red-hat-conference` and include your exported activity log
- **REXX and COBOL edge cases:** Especially welcome — see the Contributing section in the README
- **Sovereign AI / air-gapped environments:** If you need to run this completely offline and the Ollama setup isn't working for your environment, open an issue describing your setup

---

*Built for Red Hat Conference 2026 · Atlanta*
