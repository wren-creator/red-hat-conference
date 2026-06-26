![Status](https://img.shields.io/badge/status-active%20development-yellow)
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

This started at **Red Hat Summit**, where the community response was fantastic — and the feedback was even better. What I kept hearing was a version of the same question:

> *"How do I know the modernized script actually does what the old one did?"*

That question sent me back to the drawing board. The result is the **Rosetta Stone** — a rebuilt, end-to-end pipeline that doesn't just convert legacy scripts, it understands them first.

The pipeline continued to evolve through and after the **2026 Red Hat Conference in Atlanta**. Practitioner conversations there — especially around enterprise PowerShell and real Ansible migration friction — drove most of the features you see today.

This repository contains all materials from the **2026 Red Hat Conference in Atlanta** — and the continued work that followed. The conference conversations, especially around enterprise PowerShell and the real friction teams hit moving to Ansible, reshaped the pipeline significantly. What's here now is the evolved version. Includes:

- Custom Ollama ModelFiles for local, offline AI execution
- The Rosetta Stone web application (browser-only and Node.js versions)
- Scripts and tooling for the live demo pipeline
- Slides, examples, and hands-on workshop files

---

## What It Does

Modern enterprises still run thousands of aging shell scripts, cron jobs, and procedural automations. The Rosetta Stone pipeline processes them in six steps — in sequence, not just conversion:

```
① Document  →  ② Review  →  ③ Test  →  ④ Extract Vars  →  ⑤ Convert  →  ⑥ Score
```

**① Document the legacy code first**
Before anything is changed, the tool generates full developer documentation — purpose, inputs, outputs, logic walkthrough, known risks, and hardcoded assumptions. You understand what you're replacing before you replace it.

**② Review for migration complexity**
Every script is scored 0–100 for conversion complexity. Specific blockers are surfaced — platform dependencies, obscure constructs, things that simply cannot be automated cleanly. Engineers know exactly what they're walking into before committing to a migration.

**③ Generate a test script**
A test script is generated based on the *original* script's behavior and operations. The goal: prove that the modernized version does exactly what the old one did. This was the missing piece from the Summit demo, and the most important addition.

**④ Extract and name variables**
Before conversion begins, all hardcoded values are identified and a proposed variable naming scheme is generated — paths, ports, hostnames, service names, credentials, URLs. These names are injected directly into the conversion prompt so the output uses consistent, meaningful variable names from the start rather than leaving magic strings scattered through the playbook.

**⑤ Convert to the target language**
Idiomatic conversion to modern formats — with `# TODO: MANUAL REVIEW` markers inserted wherever automation hits its limits. No silent failures, no pretending a hard problem is easy. Variable names from Step ④ are used throughout.

**⑥ Score idempotency** *(Ansible target only)*
After conversion, the playbook is assessed for idempotency: can it be safely run multiple times without unintended side effects? Each task that remains imperative is flagged by name with a specific reason. Score 0–100, color-coded green/amber/red.

---

## Pipeline Features

Beyond the core six steps, the pipeline includes several safety and quality features:

**PowerShell pre-flight scanning**
Before any PowerShell script is processed, it is scanned for patterns with no clean Ansible equivalent:
- `Get-WmiObject` / `Get-CimInstance` — flagged with the specific WMI class name; each occurrence generates a `TODO: MANUAL REVIEW` in the output
- `Get-Credential`, `[PSCredential]`, `ConvertTo-SecureString -AsPlainText` — credential patterns are never passed through as plaintext; each is replaced with an Ansible Vault reference and a `TODO` explaining the required vault setup
- Warnings appear in real time as you paste — before you click Run

**Iterative refinement**
After conversion, a **Fix this** panel appears below the output. Paste an error message or describe a problem (e.g. `"ansible-lint fails: freeform is not a valid attribute on task 3"`), click re-run, and the conversion is repeated with the error context injected into the prompt. No need to start over from scratch.

**Test coverage report**
After the test script is generated, a coverage panel maps each distinct behavior in the original script to the generated tests. Green = covered, red = not covered. Shows covered/total count in the panel header so you can see at a glance whether the test suite has gaps.

**Task confidence scoring**
Every Ansible task in the converted output gets a green/amber/red confidence badge based on how directly it mapped from the source language. Low-confidence tasks — where no clean module exists or behavior is ambiguous — are named explicitly so engineers know exactly what needs manual review before shipping.

**ansible-lint validation**
After conversion, a validate panel appears with two modes depending on how you're running the app:
- **Live server mode** (via `launch.py`): click "Run ansible-lint" and violations appear inline — no terminal needed. `launch.py` runs the linter locally, parses JSON output, and returns structured results with severity, rule ID, and line number.
- **Copy-paste mode** (raw file open): download `playbook.yml`, run locally, paste the output back and the app renders structured violation rows.

Install ansible-lint to use the live mode:
```bash
pip install ansible-lint ansible-core
python3 single_html_version/launch.py
```

**Sovereign AI mode**
A toggle in Settings locks the entire app to local Ollama — all cloud provider fields are hidden and the provider select is disabled. A green banner confirms no data is leaving the machine. Includes a model recommendation panel with one-click `ollama pull` copy buttons for the four best offline models. A pre-flight check before every run confirms Ollama is responding and the selected model is available. Designed for air-gapped networks, regulated industries, and demo environments with no internet connection.

**Truncation detection**
If the model stops generating mid-output, the tool detects common truncation signatures and appends a visible warning rather than silently delivering incomplete code.

---

## Supported Languages

### Legacy source (input)
| Language | Status |
|---|---|
| Bash / Shell | ✅ Tested |
| PowerShell | ✅ Tested |
| Perl | ✅ Tested |
| AWK | ✅ Tested |
| Tcl | ✅ Tested |
| C Shell (csh) | ✅ Tested |
| Fortran | ✅ Tested |
| COBOL | ⚠️ In testing — limited to simple code sets |
| REXX | ⚠️ In testing — limited to simple code sets |

> **Note on COBOL and REXX:** These are still being validated. My test cases have been limited to simple, well-understood programs that I could verify manually. Complex COBOL (copybooks, file handling, VSAM) and production REXX scripts are not yet reliably handled. If you test with these languages, please open an issue with your results — good or bad.

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
A single self-contained HTML file. Open in Chrome or Edge, enter your API key in the Settings panel, and go. Full File System Access API support for directory picking and output saving. API key is held in memory only — never written to disk.

```
single_html_version/
  index.html     ← entire app in one file
  launch.py      ← optional Python server (zero pip installs)
  README.txt
```

### Node.js version (recommended for teams)
A proper Express server that proxies all AI calls server-side. API key lives in `.env` and never touches the browser. Works in every browser including Safari and Firefox. Supports server-side directory scanning and file writing.

```
node.js_version/
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

The app supports four providers, switchable from the Settings panel with no code changes required.

### Ollama (local / sovereign)
Run everything locally with no API costs and no data leaving your network. Pull any supported code model:

```bash
ollama pull qwen2.5-coder
ollama serve
```

Recommended for air-gapped environments, regulated industries, and cost-sensitive teams. The Ollama ModelFile in this repo is purpose-built for legacy-to-Ansible conversion.

### Anthropic Claude
Fastest results, best quality on complex legacy code. Requires an API key from [console.anthropic.com](https://console.anthropic.com). Up to 200K token context window — handles large scripts that exceed local model limits.

### OpenAI GPT
Supports GPT-4o and GPT-4 Turbo via API key. Models are fetched dynamically from the OpenAI API after key entry. 128K context window.

### Google Gemini
Supports Gemini 1.5 Pro and 2.0 Flash via API key. Up to 1M token context — best option for very large scripts. Models are fetched dynamically.

---

## Ollama ModelFiles

The `Model-files/` directory contains custom Ollama ModelFiles used in the live demos. These models are purpose-built for:

- Legacy script analysis
- YAML and structured data generation
- Safety-first refactoring with idiomatic output
- Local / offline / air-gapped execution
- Running on developer laptops, containers, or zLinux

**Build and run the legacy-to-Ansible model:**

```bash
ollama create legacy2ansible -f Model-files/legacy2ansible.modelfile
ollama run legacy2ansible
```

---

## Scripts

The `scripts/` directory contains supporting tooling:

| File | Purpose |
|---|---|
| `OpenAI-compatible-one-line.sh` | Single-command Bash → Python conversion via any OpenAI-compatible endpoint |
| `modernizer-validator.sh` | Batch conversion pipeline with `ansible-lint` validation |

---

## Documentation

Extended documentation lives in the `docs/` directory:

| File | Contents |
|---|---|
| `HARDWARE.md` | Hardware sizing guide and model pricing for self-hosted deployments |
| `TROUBLESHOOTING.md` | Diagnostic steps for common Ollama, CORS, and provider connection issues |
| `ROADMAP.md` | Full feature roadmap with priority order and integration effort ratings |
| `SECURITY.md` | Security policy and responsible disclosure |
| `CONTACT.md` | How to reach the maintainer |

---

## Known Limitations & Open Issues

- **COBOL and REXX** conversion is experimental. Only simple, single-file programs without copybooks, external file definitions, or mainframe-specific intrinsic functions have been validated.
- **Complex Bash** with heavy use of `eval`, dynamic variable names, or process substitution may produce incomplete conversions — the complexity scorer will flag these.
- **Ansible conversion** works best for infrastructure automation scripts. Application-layer logic (complex string processing, algorithmic code) maps poorly to Ansible's declarative model and will generate `TODO` markers accordingly.
- **Test script generation** is based on behavioral inference from the source code, not execution. Generated tests should be reviewed and run in a safe environment before being used to gate any deployment.
- **Large scripts** (1000+ lines) require a cloud provider. Local Ollama models have limited context windows. Script chunking with stitched output is on the roadmap but not yet implemented.

---

## Roadmap

See `docs/ROADMAP.md` for the full prioritized list.

### Completed (15 of 18 roadmap items)

- [x] **WMI/CIM detection** — real-time pre-flight scan flags `Get-WmiObject` / `Get-CimInstance` before conversion runs
- [x] **Windows credential handling** — detects `Get-Credential`, `PSCredential`, `ConvertTo-SecureString`; maps to Ansible Vault references with setup TODOs
- [x] **Annotation mode** — toggleable inline comments in converted output explaining each mapping decision
- [x] **Side-by-side diff view** — original script left, converted output right; toggle between single and split pane
- [x] **Iterative refinement** — "Fix this" panel below output; paste an error or describe a problem and re-run with context injected
- [x] **Variable extraction pass** — dedicated pre-conversion step identifying hardcoded values and proposing a naming scheme; names flow into the conversion prompt
- [x] **Idempotency scoring** — post-conversion assessment of how idempotent the Ansible output is; each imperative task flagged by name, color-coded 0–100
- [x] **Conversion history** — session-scoped log of every script processed; flip back to any previous result without re-running
- [x] **Test coverage report** — maps each behavior in the original script to the generated tests; shows covered/total count
- [x] **Task confidence scoring** — green/amber/red badge per Ansible task based on how directly it mapped from the source language
- [x] **ansible-lint validation** — live server mode via `launch.py` runs linting inline; copy-paste mode for raw file use; both render structured violation rows
- [x] **Sovereign AI mode** — Settings toggle locks to local Ollama; model recommendations with one-click pull commands; pre-flight check before every run; full setup guide at [docs/SOVEREIGN.md](docs/SOVEREIGN.md)
- [x] **Script chunking** — scripts over ~1,500 tokens are automatically split into chunks, processed section by section, and merged; transparent to the user
- [x] **Ansible Automation Platform (AAP) compatibility** — all converted Ansible output uses FQCN module names (`ansible.builtin.*`), populates `vars:` from extracted variables, generates handlers for service operations, and includes a project layout comment for AAP deployment
- [x] **Codebase restructure** — split from a 2,599-line monolith into `index.html` (markup), `style.css`, and `app.js` for maintainability

### Up next

- [ ] **Ansible role scaffolding** — output a proper role directory structure (`tasks/`, `vars/`, `handlers/`, `defaults/`) for complex scripts
- [ ] **Export to ZIP / PR** — bundle converted file, test script, and docs for download or push directly to a GitHub branch
- [ ] **Multi-file dependency awareness** — detect sourced scripts during batch processing and convert them together
- [ ] **Before/after parity check** and **test execution harness** — require a script execution environment; planned for the Node.js version

### Known Limitations

See `docs/ROADMAP.md` for the full limitations tracking table. Short version:

- **COBOL** — copybook handling and VSAM I/O not yet reliable; limited to simple single-file programs
- **REXX** — host environment calls (`ADDRESS TSO/ISPF/CMS/CP`) produce TODO markers with no guidance; complex EXECIO patterns unreliable
- **Complex Bash** — `eval`, dynamic variable names `${!var}`, and process substitution `<()` cannot be cleanly converted; complexity scorer flags them but offers no fix path
- **Ansible for application logic** — scripts with heavy algorithmic logic or string processing produce `ansible.builtin.shell`-heavy output; Ansible is not the right target for these cases

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

*Presented at Red Hat Conference 2026 · Atlanta*
*Started at Red Hat Summit · Rebuilt with community feedback · Continuing to evolve*
