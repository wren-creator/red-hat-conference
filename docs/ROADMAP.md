# Rosetta Stone — Feature Enhancement Roadmap

> Tracking document for planned improvements. Maintained alongside the project for use in Claude Code.
> Priority order reflects impact. Integration effort reflects complexity of adding to the single-file browser app or its supporting infrastructure.

---

## Legend

| Integration effort | Meaning |
|---|---|
| 🟢 Easy | Self-contained JS change inside the existing single-file app |
| 🟡 Medium | Requires new UI, a new pipeline step, or careful prompt engineering |
| 🔴 Hard | Requires backend infrastructure, external tooling, or architectural changes |

---

## Immediate Value

| # | Feature | Priority | Integration |
|---|---|---|---|
| 1 | **Script chunking** — split 1000+ line scripts into logical sections, convert each independently, stitch output | Critical | 🔴 Hard |
| 2 | **Conversion validation** — run `ansible-lint` output check; flag a copy-paste command for terminal validation | Critical | 🔴 Hard |
| 3 | **Side-by-side diff view** — original script left, converted output right, with line-level alignment | High | 🟡 Medium |
| 4 | **Iterative refinement** — "Fix this" input to paste an error or describe a problem, re-runs conversion step with that context injected | High | 🟢 Easy |

---

## Pipeline Improvements

| # | Feature | Priority | Integration |
|---|---|---|---|
| 5 | **Variable extraction pass** — dedicated pre-conversion step identifying all hardcoded values and proposing a variable naming scheme before conversion | High | ✅ Done |
| 6 | **Idempotency scoring** — post-conversion assessment of how idempotent the Ansible output actually is; flags tasks that remain imperative | High | 🟢 Easy |
| 7 | **Ansible role scaffolding** — output a proper role directory structure (`tasks/`, `vars/`, `handlers/`, `defaults/`) for scripts above a complexity threshold | Medium | ✅ Done |
| 8 | **Multi-file dependency awareness** — detect that script B sources script A during batch processing and convert them together rather than independently | Medium | ✅ Done |

---

## Testing Improvements

| # | Feature | Priority | Integration |
|---|---|---|---|
| 9 | **Test coverage report** — maps each behavior in the original script to a generated test case; flags any behaviors with no coverage | High | 🟡 Medium |
| 10 | **Before/after parity check** — runs both original and converted script against a sanitized set of inputs and compares outputs automatically | High | 🔴 Hard |
| 11 | **Test execution harness** — lightweight Docker-based runner that actually executes generated bash/pytest tests against converted output and reports pass/fail | Medium | 🔴 Hard |

---

## UX and Demo Quality

| # | Feature | Priority | Integration |
|---|---|---|---|
| 12 | **Annotation mode** — inline comments in converted output explaining why each mapping was made; toggleable on/off | High | 🟢 Easy |
| 13 | **Confidence scoring per task** — each converted Ansible task gets a green/amber/red confidence indicator based on how direct the mapping was | Medium | 🟡 Medium |
| 14 | **Conversion history** — session-scoped log of every script processed with ability to flip back to a previous result without re-running | Medium | 🟡 Medium |
| 15 | **Export to PR** — push converted file, test script, and docs directly to a GitHub branch via the API, ready for review | Low | 🔴 Hard |

---

## Enterprise / PowerShell-Specific

| # | Feature | Priority | Integration |
|---|---|---|---|
| 16 | **Windows credential handling** — detect `Get-Credential`, `PSCredential`, and `SecureString` patterns; map to Ansible Vault references with TODO pointing to vault setup docs | Critical for PS→Ansible | 🟢 Easy |
| 17 | **WMI/CIM detection** — flag every `Get-WmiObject` / `Get-CimInstance` call explicitly with a TODO; these have no clean Ansible equivalent and are common in real enterprise scripts | Critical for PS→Ansible | 🟢 Easy |
| 18 | **Sovereign AI mode** — first-class offline configuration for air-gapped Windows environments where code cannot leave the building; builds on existing Ollama ModelFile infrastructure | Strategic | 🔴 Hard |

---

## Sorted by Integration Ease

### 🟢 Easy — Self-contained, no infrastructure needed

| # | Feature | Notes |
|---|---|---|
| 4 | Iterative refinement ("Fix this" input) | Add a textarea + re-run button below the converted output; inject error context into conversion prompt |
| 5 | ~~Variable extraction pass~~ | ✅ Done — runs as step 2.5 in both single and chunked pipelines |
| 6 | Idempotency scoring | Post-conversion callAI assessment; same pattern as complexity scorer |
| 12 | Annotation mode | Prompt instruction toggle; add a checkbox to Settings |
| 16 | Windows credential handling | Add to `LANG_HINTS.powershell.convert`; prompt-only |
| 17 | WMI/CIM detection | Pre-flight regex scan of source + warning banner; 10 lines of JS |

### 🟡 Medium — New UI or careful prompt engineering required

| # | Feature | Notes |
|---|---|---|
| 3 | Side-by-side diff view | New output panel layout; CSS grid split with JS diff highlighting |
| 9 | Test coverage report | New output tab; post-test-generation assessment prompt |
| 13 | Confidence scoring per task | Parse converted YAML, score each task block, render inline badges |
| 14 | Conversion history | Session state array + history dropdown; no backend needed |

### 🔴 Hard — Requires backend, Docker, or architectural changes

| # | Feature | Notes |
|---|---|---|
| 1 | Script chunking | Requires semantic section detection + stitching logic; hardest problem on the list |
| 2 | Conversion validation | `ansible-lint` needs a runtime; best solved in Claude Code / Node.js version |
| 7 | ~~Ansible role scaffolding~~ | ✅ Done — related-script detection groups output into `roles/<name>/tasks/main.yml` AAP layout |
| 8 | ~~Multi-file dependency awareness~~ | ✅ Done — union-find grouping of sourced/called scripts into orchestrator/member roles |
| 10 | Before/after parity check | Needs script execution environment; Docker or VM |
| 11 | Test execution harness | Docker-based runner; backend work |
| 15 | Export to PR | GitHub API integration; needs auth and token handling |
| 18 | Sovereign AI mode | Infrastructure + model selection + configuration guide |

---

## Known Limitations (Active Tracking)

These are confirmed gaps in the current implementation. They are not aspirational roadmap items — they are things that break or produce unreliable output today.

| # | Limitation | Severity | Path to resolution |
|---|---|---|---|
| L1 | **COBOL — copybooks unresolved** | High | COPY directives cannot be followed without the copybook source; always inserts TODO. Validated conversion requires copybook-aware pre-processing before the app can handle it. |
| L2 | **COBOL — VSAM, file I/O** | High | FILE SECTION / OPEN / READ / WRITE operations are partially mapped but complex multi-file COBOL programs produce unreliable output. Currently limited to simple single-file programs. |
| L3 | **REXX — host environment calls** | High | ADDRESS TSO, ADDRESS ISPF, ADDRESS CMS/CP have no Linux equivalent. The app inserts TODO markers but cannot guide the user on what to do next for mainframe-specific host commands. |
| L4 | **REXX — EXECIO file I/O** | Medium | EXECIO * DISKR/DISKW patterns are mapped but edge cases around stem variable handling produce incorrect output for complex EXECIO usage. |
| L5 | **Bash — eval and dynamic variables** | Medium | `eval`, dynamic variable names (`${!varname}`), and process substitution `<()` cannot be reliably converted. The complexity scorer flags these but there is no mitigation path — the user gets TODO markers and is left without guidance. |
| L6 | **Ansible — application-layer logic** | Medium | Scripts with heavy string processing, algorithmic logic, or complex data transformation produce Ansible output with excessive `ansible.builtin.shell` tasks rather than proper module usage. The idempotency scorer flags this but offers no fix. |
| L7 | **Ansible — handlers in chunked output** | Low | When processing large scripts in chunks, handler definitions requested in chunk prompts may be duplicated across chunks or placed incorrectly. Manual review of the merged handlers section is required. |

---

## Recommended Starting Point for Claude Code

Based on effort-to-impact ratio, start here:

1. **#17 WMI/CIM detection** — 10 lines of JS, directly relevant to Monday's PowerShell conversation
2. **#16 Windows credential handling** — prompt addition, no structural change
3. **#4 Iterative refinement** — highest UX payoff for a single-session change
4. **#6 Idempotency scoring** — reuses the complexity scorer pattern exactly
5. **#5 Variable extraction pass** — new pipeline step, prompt-only, clear demo value

---

*Last updated: June 2026*
*Built for Red Hat Conference 2026 · Atlanta*
