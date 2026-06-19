![Status](https://img.shields.io/badge/status-work%20in%20progress-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-18%2B-green)
![Python](https://img.shields.io/badge/python-3.6%2B-blue)
![Ollama](https://img.shields.io/badge/ollama-compatible-purple)
![Anthropic](https://img.shields.io/badge/anthropic-claude--sonnet--4-orange)
![Ansible](https://img.shields.io/badge/ansible-ready-red)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20zLinux-lightgrey)
![Conference](https://img.shields.io/badge/Red%20Hat%20Conference-2026%20Atlanta-red)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

# Legacy Code Modernizer — Rosetta Stone
### Modernizing Legacy Automation With AI + Ansible + Ollama

> **⚠️ Work in Progress**
> This project is actively evolving. I am still testing, working through edge cases, and refining the conversion pipeline. Please read the known limitations section before using this in any production context. Feedback, issues, and pull requests are genuinely welcome — this project exists because of community input.

---

## The Story

I first presented this idea at **Red Hat Summit**. The community response was fantastic — and the feedback was even better. What I kept hearing was a version of the same question:

> *"How do I know the modernized script actually does what the old one did?"*

That question sent me back to the drawing board. The result is the **Rosetta Stone** — a rebuilt, end-to-end pipeline that doesn't just convert legacy scripts, it understands them first.

This repository contains all materials used for the **2026 Red Hat Conference in Atlanta**, including:

- Custom Ollama ModelFiles for local, offline AI execution
- The Rosetta Stone web application (browser-only and Node.js versions)
- Scripts and tooling for the live demo pipeline
- Slides, examples, and hands-on workshop files

---

## What It Does

Modern enterprises still run thousands of aging shell scripts, cron jobs, and procedural automations. The Rosetta Stone pipeline processes them in four steps — in sequence, not just conversion:

```
① Document  →  ② Review  →  ③ Test  →  ④ Convert
```

**① Document the legacy code first**
Before anything is changed, the tool generates full developer documentation — purpose, inputs, outputs, logic walkthrough, known risks, and hardcoded assumptions. You understand what you're replacing before you replace it.

**② Review for migration complexity**
Every script is scored 0–100 for conversion complexity. Specific blockers are surfaced — platform dependencies, obscure constructs, things that simply cannot be automated cleanly. Engineers know exactly what they're walking into before committing to a migration.

**③ Generate a test script**
A test script is generated based on the *original* script's behavior and operations. The goal: prove that the modernized version does exactly what the old one did. This was the missing piece from the Summit demo, and the most important addition.

**④ Convert to the target language**
Idiomatic conversion to modern formats — with `# TODO: MANUAL REVIEW` markers inserted wherever automation hits its limits. No silent failures, no pretending a hard problem is easy.

---

## Supported Languages

### Legacy source (input)

| Language | Status |
|---|---|
| Bash / Shell | ✅ Tested |
| Perl | ✅ Tested |
| AWK | ✅ Tested |
| Tcl | ✅ Tested |
| C Shell (csh) | ✅ Tested |
| Fortran | ✅ Tested |
| COBOL | ⚠️ In testing — limited to simple code sets |
| REXX (z/VM Mainframe) | ⚠️ In testing — limited to simple code sets |

> **Note on COBOL and REXX:** These are still being validated. REXX conversion includes special handling for `ADDRESS COMMAND/TSO/CMS/CP` host environment calls (mapped to subprocess or ansible shell tasks) and `EXECIO` file I/O patterns. Complex COBOL (copybooks, file handling, VSAM) and production REXX with host environment dependencies are not yet reliably handled. If you test with these languages, please open an issue with your results — good or bad.

### Modern targets (output)

| Target | Status |
|---|---|
| Ansible YAML Playbook | ✅ Primary target |
| Python 3 | ✅ Tested |
| Terraform HCL | ✅ Tested |
| Go | ✅ Tested |
| PowerShell (modern) | ✅ Tested |

---

## Application Versions

### Browser-only (no Node required)

A single self-contained HTML file. Open in Chrome or Edge, configure your AI provider in the Settings panel, and go. Full File System Access API support for directory picking and output saving. API keys are held in memory only — never written to disk.

```
single_html_version/
  index.html     ← entire app in one file
  launch.py      ← optional Python server (zero pip installs)
  README.txt
```

**To run directly:**
Double-click `index.html` in Chrome or Edge, or drag it into the browser.

**To run via the Python server (recommended for full file access):**
```bash
python3 launch.py
# Opens http://localhost:8000/index.html automatically

python3 launch.py --port 8080   # alternate port
python3 launch.py --no-browser  # skip auto-open
```

**Deployed on GitHub Pages:**
The browser version is also hosted at:
```
https://wren-creator.github.io/red-hat-conference/
```
Users supply their own API key at runtime — nothing is stored server-side.

### Node.js version (recommended for teams)

A proper Express server that proxies all AI calls server-side. API key lives in `.env` and never touches the browser. Works in every browser including Safari and Firefox. Supports server-side directory scanning and file writing.

```
rosetta-stone-node/
  server.js            ← Express server
  public/index.html    ← frontend
  package.json
  .env.example         ← copy to .env, add your key
```

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
npm start              # → http://localhost:3000
```

---

## AI Provider Options

The app supports four AI providers, switchable at runtime from the **Settings** panel.

### Ollama (local / sovereign AI)

Run everything locally with no API costs. Pull any supported code model:

```bash
ollama pull qwen2.5-coder
ollama serve
```

If serving the app from a non-localhost origin (e.g. GitHub Pages), Ollama needs CORS enabled:
```bash
OLLAMA_ORIGINS="https://your-origin.com" ollama serve
```

The app will auto-detect your running Ollama instance, load available models into the dropdown, and surface a fix command if CORS is blocking the connection. Use the **Diagnostics** panel → **Auto-Detect** tab to verify Ollama status before a demo.

### Anthropic Claude API

Fastest results, best quality on complex legacy code. Requires an API key from [console.anthropic.com](https://console.anthropic.com). Enter it in the Settings panel — it is held in memory only and cleared when the tab closes. Supports up to 200K token context window.

Recommended model: **claude-sonnet-4** (balance of speed and quality). Also available: claude-opus-4 (most capable), claude-haiku-4-5 (fastest).

### OpenAI GPT

Enter your OpenAI API key in Settings. The app loads available chat models (GPT-4o, GPT-4o mini, GPT-4 Turbo, o1, o3 variants) directly from the API after key entry. Supports up to 128K token context.

### Google Gemini

Enter your Gemini API key in Settings. Available models load automatically from the API. Supports up to 1M token context window.

---

## Settings Panel

Click the **⚙ Settings** button in the top-right header to configure:

- **Provider** — switch between Ollama, Anthropic, OpenAI, and Gemini
- **API key** — entered per-session, held in memory only
- **Model** — auto-populated from the API or Ollama instance; override manually if needed
- **Max tokens per request** — 500 (small Ollama models) / 1000 (default) / 2000 / 4000
- **Temperature** — 0.1 deterministic (recommended for code) / 0.3 / 0.7
- **Skip complexity assessment** — speeds up batch processing when pre-checking isn't needed
- **Batch delay** — adds a pause between files to avoid rate limiting

The **Test connection** button sends a minimal test request to verify your provider and key are working before you run a real conversion.

> **Large script handling:** Scripts over ~1,500 tokens (~6,000 characters) are automatically split into chunks and processed section by section, then merged into a single output. For Ansible, all task chunks are merged under one playbook header. For other targets, sections are concatenated with markers. An amber banner appears during chunked runs showing how many sections are being processed. No configuration needed — chunking is transparent.

Non-sensitive preferences (provider choice, model name, Ollama URL) are saved to `localStorage` so you don't have to re-enter them each session.

---

## Diagnostics Panel

Click the **🔬 Diagnostics** button in the header (next to Settings) to open the diagnostics panel. This was built specifically for live demo confidence — if something is wrong, you'll see it here before it breaks mid-presentation.

The panel has three tabs:

**Signal Board**
Populated after the first conversion run. Shows 10 live status signals:

| Signal | What it measures |
|---|---|
| API / server reachable | Whether the provider endpoint responded |
| Auth / key accepted | Whether the API key was accepted (401 = bad key) |
| Model confirmed | Which model handled the last request |
| Response time | Last request duration — amber >8s, green otherwise |
| Stream health | Whether streaming completed cleanly |
| Token headroom | Estimated tokens remaining before hitting max_tokens |
| Last response complete | Whether the response ended normally or was cut off |
| Output validity | Whether the response contained usable content |
| Error count | Cumulative errors this session |
| Rate limit | Whether any 429 rate-limit errors occurred |

**Auto-Detect**
Runs automatically when the panel opens and after every conversion. Checks all four providers side by side — useful for seeing exactly what's connected and what isn't before a demo. Shows key validity, format check, API reachability (live ping), and model status for each provider.

**Activity Log**
Accumulates in the background from page load regardless of whether the panel is open. Every API call is logged with timestamp, level (OK / WARN / ERR / INFO), message, and duration. Export the full log to a `.txt` file for post-demo review or sharing with collaborators.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for a full guide on interpreting diagnostics output and resolving common issues.

---

## Complexity Scoring

Before conversion, each script is scored 0–100 for migration difficulty:

| Score | Level | Meaning |
|---|---|---|
| 0–33 | 🟢 Clean | Fully automatable — proceed with confidence |
| 34–66 | 🟡 Moderate | Review recommended — specific blockers surfaced |
| 67–100 | 🔴 Complex / Risky | Manual intervention required — TODO markers will be inserted |

Scripts flagged red will have `# TODO: MANUAL REVIEW` comments inserted at exact locations in the converted output that require human attention.

---

## Ollama ModelFiles

The `model-files/` directory contains custom Ollama ModelFiles used in the live demos. These models are purpose-built for:

- Legacy script analysis
- YAML and structured data generation
- Safety-first refactoring with idiomatic output
- Local / offline / air-gapped execution
- Running on developer laptops, containers, or zLinux

**Build and run the legacy-to-Ansible model:**

```bash
ollama create legacy2ansible -f model-files/legacy2ansible.modelfile
ollama run legacy2ansible
```

---

## Scripts

The `scripts/` directory contains supporting tooling:

| File | Purpose |
|---|---|
| `OpenAI-compatible-one-line.sh` | Single-command Bash → Python conversion via any OpenAI-compatible endpoint |
| `modernizer-validator.sh` | Batch conversion pipeline with `ansible-lint` validation |
| `one-liner-ollama` | Quick Ollama-based conversion one-liner |

---

## Known Limitations & Open Issues

- **COBOL and REXX** conversion is experimental. Only simple, single-file programs without copybooks, external file definitions, or mainframe-specific intrinsic functions have been validated.
- **Complex Bash** with heavy use of `eval`, dynamic variable names, or process substitution may produce incomplete conversions — the complexity scorer will flag these.
- **Ansible conversion** works best for infrastructure automation scripts. Application-layer logic (complex string processing, algorithmic code) maps poorly to Ansible's declarative model and will generate `TODO` markers accordingly.
- **Test script generation** is based on behavioral inference from the source code, not execution. Generated tests should be reviewed and run in a safe environment before being used to gate any deployment.
- **Ollama context limits** — the app auto-detects your model's context window. Scripts that exceed it are automatically processed in chunks (see Settings Panel above), or you can switch to a cloud provider for very large inputs.
- The **sovereign AI option** is not yet implemented as a simplified configuration. Ollama support is available but the model recommendations and single-command setup for cost-sensitive or air-gapped environments are still being built out.

---

## Roadmap

- [ ] Validated COBOL support with copybook handling
- [ ] Validated REXX support with host command environment awareness
- [ ] Sovereign AI configuration guide with recommended local models
- [ ] Simplified single-command setup for offline/air-gapped environments
- [ ] Extended test script generation with actual execution harness
- [ ] Additional legacy languages (JCL, SAS, RPG — under consideration)

---

## Contributing

This project is a living demo, not a finished product. If you:

- Test it with a language or script type not covered above
- Find a conversion that goes wrong in an interesting way
- Have production COBOL or REXX you'd like to help validate against
- Work in an environment where sovereign AI is a hard requirement

...please open an issue or reach out directly. The best features in this tool came from community feedback at Summit, and that's not changing.

---

## Reproducibility

These demos are designed to run on Linux, macOS, and zLinux. The browser-only version requires Chrome 86+ or Edge 86+. The Node.js version requires Node 18+. No other global dependencies.

---

*Built for Red Hat Conference 2026 · Atlanta*
*Started at Red Hat Summit · Rebuilt with community feedback*
