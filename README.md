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
rosetta-stone/
  rosetta-stone.html   ← entire app in one file
  launch.py            ← optional Python server (zero pip installs)
  README.txt
```

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

### Anthropic API
Fastest results, best quality on complex legacy code. Requires an API key from [console.anthropic.com](https://console.anthropic.com). Set it in `.env` (Node version) or the Settings panel (browser version).

### Ollama (local)
Run everything locally with no API costs. Pull any supported code model:

```bash
ollama pull qwen2.5-coder
ollama serve
```

### Sovereign AI — Coming Soon

> **This is next on the roadmap.**
>
> Not every team can absorb large token costs, and not every environment can send code to an external API — air-gapped systems, regulated industries, organizations with strict data residency requirements. A sovereign AI configuration using locally-run models is being built out as a first-class option, not an afterthought. The Ollama ModelFile infrastructure in this repo is the foundation for that work.

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
- The **sovereign AI option** is not yet implemented. Ollama support is available but the simplified configuration and model recommendations for cost-sensitive environments are still being built out.

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
