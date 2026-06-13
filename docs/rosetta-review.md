# Rosetta Stone — Project Review & LANG_HINTS Drop-in
*Prepared ahead of Monday's PowerShell → Ansible meeting*

---

## Part 1 — LANG_HINTS Drop-in (ready to paste)

Add this object directly below your `TGT_EXT` declaration in the `<script>` block.

```javascript
const LANG_HINTS = {

  bash: {
    convert: `Bash-specific: Preserve pipelines — pipe chains (cmd1 | cmd2) should map to
registered vars + subsequent tasks in Ansible, or chained calls in Python/Go.
set -euo pipefail semantics map to: ignore_errors: no in Ansible, raise on
non-zero in Python. Brace expansion ({a,b,c}) and glob patterns need explicit
equivalents. Here-docs map to ansible.builtin.copy content: blocks or
Python triple-quoted strings. Process substitution <() has no clean equivalent
— insert TODO. $() command substitution maps to register: in Ansible.
Trap/signal handling (trap ... ERR/EXIT) needs explicit mapping or a TODO.`,

    test: `Bash-specific: Tests must verify: exit code behavior under set -e,
pipeline failure propagation, glob expansion results, and any trap/cleanup
handlers. For Ansible targets, test that registered vars contain expected
stdout. For Python targets, verify subprocess.run() return codes match
original script's exit codes. Use bats-core or pytest-subprocess where
applicable. Assert on side effects: files created, directories changed,
permissions set.`,
  },

  perl: {
    convert: `Perl-specific: $_ implicit variable must be made explicit in all targets.
@_ in subroutines maps to function parameters. wantarray() context has no
direct equivalent — document behavior. Special variables: $! (errno) →
OSError, $@ (eval error) → try/except, $/ (input record separator) →
file read mode, $0 (script name) → sys.argv[0] or __file__. Regex with
/g modifier in while loops → re.finditer() or findall(). die → raise
RuntimeError. Perl references and dereferencing need care — $$ref, @$ref,
%$ref. use strict / use warnings imply all variables are declared —
preserve that discipline. CPAN module usage (use File::Basename etc.) must
be mapped to stdlib equivalents or flagged with TODO if no equivalent
exists. Hash slices (@hash{@keys}) need explicit loops in most targets.`,

    test: `Perl-specific: Tests must cover: regex capture group behavior and /g
loop semantics, die/eval error handling (especially nested), file handle
open/close and $! error states, hash and array reference dereferencing,
any CPAN module behavior being replaced, and $/ separator edge cases.
Verify that all special variable behavior is preserved in the converted
output.`,
  },

  cobol: {
    convert: `COBOL-specific: WORKING-STORAGE SECTION variables → playbook vars (Ansible)
or typed variables (Python/Go). Map PIC 9(n)V99 implied-decimal fields to
Python Decimal or float with explicit scaling — do NOT silently truncate.
PERFORM → function call or loop. PERFORM n TIMES → for range(n).
PERFORM UNTIL → while loop (watch the pre-test vs post-test distinction —
PERFORM UNTIL tests BEFORE executing, like a while, not a do-while).
COMPUTE → arithmetic expression. MOVE → assignment. EVALUATE → match/case
or if/elif chain. FILE SECTION / SELECT / FD / OPEN / READ / WRITE →
file I/O — never silently drop file operations, always insert TODO if
mapping is ambiguous. COPY (copybook) → cannot be resolved without the
copybook source — always insert TODO: MANUAL REVIEW with the copybook name.
VSAM file access has no clean equivalent — insert TODO. CALL to external
programs → subprocess or TODO. STRING/UNSTRING → string split/join.
INSPECT → re.sub() or string replace. Level-88 condition names →
named constants or Enum.`,

    test: `COBOL-specific: Tests MUST verify decimal precision — PIC V-notation
implied decimals are a common source of conversion bugs. Assert on:
PERFORM loop iteration counts (especially PERFORM UNTIL with compound
conditions), EVALUATE branch coverage, MOVE numeric truncation behavior,
STRING/UNSTRING delimiter handling, and any OPEN/READ/WRITE file
operations. For Ansible targets, assert that vars reflect WORKING-STORAGE
initial values. Flag any test that cannot be written without the copybook
as TODO: NEEDS COPYBOOK.`,
  },

  rexx: {
    convert: `REXX-specific: ADDRESS COMMAND executes host OS commands — map to
ansible.builtin.shell or subprocess.run(). ADDRESS TSO/ISPF/CMS/CP are
z/VM or TSO environment-specific — map to ansible.builtin.shell with
appropriate note, or insert TODO if the command has no Linux equivalent.
EXECIO maps to file read/write — EXECIO * DISKR reads all lines,
EXECIO * DISKW writes all lines. SAY → print() or ansible debug: msg:.
ARG uppercases all input by default — account for this in string
comparisons. PULL reads from stdin (also uppercases). PARSE ARG/PULL/VAR
→ explicit string splitting. Stem variables (array.1, array.2, array.0
for count) → list or dict. SIGNAL ON ERROR/HALT/SYNTAX → try/except.
INTERPRET (dynamic eval) has no safe equivalent — always insert TODO.
Mainframe intrinsic functions (USERID(), SYSVAR()) need TODO if no
equivalent exists in target environment.`,

    test: `REXX-specific: Tests must verify: ARG uppercasing behavior (pass mixed-
case input, assert uppercase comparison), SAY output capture, EXECIO
file read/write round-trips, stem variable indexing (0-element is count),
PARSE ARG tokenization, and any CP/CMS command side effects — these
should be mocked or explicitly documented as untestable without z/VM.
Flag any test requiring a mainframe environment as TODO: REQUIRES Z/VM.`,
  },

  fortran: {
    convert: `Fortran-specific: IMPLICIT NONE means all variables are explicitly typed —
preserve all types precisely. DO loop with numeric label (DO 10 I=1,N /
10 CONTINUE) → for i in range(1, n+1) — note Fortran is 1-indexed,
most targets are 0-indexed, adjust all array accesses. COMMON blocks have
no direct equivalent — map to module-level variables or a config dict,
insert TODO. EQUIVALENCE has no safe equivalent — always TODO.
WRITE(*,*) and FORMAT statements → print() with f-strings or format().
READ(*,*) → input() or sys.stdin. SUBROUTINE/FUNCTION → def or func.
INTENT(IN/OUT/INOUT) on arguments → document in docstring, Python does
not enforce this. Array operations (whole-array arithmetic) → NumPy or
explicit loops. OPEN/CLOSE/READ/WRITE file units → with open() blocks.
GOTO has no equivalent — restructure as loop/break or insert TODO if
the control flow is non-trivial. DATA statement initializers → variable
declarations with initial values.`,

    test: `Fortran-specific: Tests MUST verify floating-point precision — Fortran
REAL vs Python float vs Go float64 can produce different rounding.
Assert on: loop bounds (1-indexed source vs 0-indexed target — off-by-one
is the most common Fortran conversion bug), WRITE format output formatting,
array operation results vs element-wise equivalents, and SUBROUTINE
INTENT(OUT) side effects. For any COMMON block conversion, assert that
shared state behaves identically across converted function calls.`,
  },

  awk: {
    convert: `AWK-specific: BEGIN block → setup/init code before main loop.
END block → teardown/summary code after main loop. Pattern { action }
→ if (condition): action inside a line-iteration loop. FS (field
separator) → split() delimiter or csv.reader(). NR (record number) →
enumerate() index + 1. NF (number of fields) → len(fields). $0 (whole
line) → line variable. $1..$n (fields) → fields[0]..fields[n-1]
(adjust for 0-indexing). printf → print(f"...") or fmt.Printf().
getline → file read or subprocess. Associative arrays → dict.
OFMT/CONVFMT → explicit float formatting. Multiple input files → handle
via sys.argv or playbook with_items. RS (record separator) → non-default
splits need explicit handling with TODO if RS != newline.`,

    test: `AWK-specific: Tests must verify: FS delimiter handling (especially
multi-char or regex FS), NR/NF edge cases (empty lines, trailing fields),
BEGIN/END execution order, associative array accumulation results,
printf format string output, and behavior with multiple input files.
Pipe input (cmd | awk) → test with mocked stdin. Assert numeric vs
string comparison behavior — AWK auto-detects, targets may not.`,
  },

  tcl: {
    convert: `Tcl-specific: Everything is a string — type coercion is implicit, make
it explicit in the target. set var value → variable assignment.
puts → print() or debug: msg:. exec → subprocess.run() or
ansible.builtin.shell. foreach item $list → for item in list.
proc name {args} {body} → def or func. lindex, lappend, llength →
list indexing and methods. string commands (string length, string
toupper etc.) → str methods. regexp/regsub → re module.
catch {cmd} result → try/except. after ms → time.sleep(ms/1000).
namespace → module or class. Tk (GUI) calls cannot be converted —
always insert TODO. package require → import with TODO if no equivalent.
dict get/set (Tcl 8.5+) → dict access.`,

    test: `Tcl-specific: Tests must verify: string coercion edge cases (numeric
strings used in arithmetic), list operation results (lindex, lappend),
regexp capture group behavior, catch/error propagation, exec command
output and return code capture, and foreach over multi-element lists.
Any Tk/GUI proc must be flagged as TODO: UNTESTABLE WITHOUT DISPLAY.`,
  },

  csh: {
    convert: `C Shell-specific: csh has significant differences from bash — do not
assume bash equivalence. set var = value → assignment (note spaces
around =). setenv VAR value → environment variable (→ os.environ or
Ansible environment: block). foreach var (list) ... end → for loop.
while (condition) ... end → while loop. if (condition) then ... endif
→ if block. if (-d path) / if (-f path) → os.path.isdir() /
os.path.isfile() or ansible.builtin.stat. $status (exit code) →
return code check. $argv (argument list) → sys.argv or Ansible vars.
Aliases have no direct equivalent — map to functions or remove.
history and job control constructs cannot be converted — insert TODO.
Multiline commands with backslash continuation → standard multiline
in target. Note: csh arithmetic uses @ var = expr, not $(( )).`,

    test: `C Shell-specific: Tests must verify: environment variable propagation
(setenv behavior), exit status ($status) checking, file test operator
results (-d, -f, -r, -w, -x), foreach list iteration with edge cases
(empty list, single item), and any argv handling. Assert that converted
environment variable setting is visible to child processes as in the
original csh script.`,
  },
};
```

### Wiring it into processOne

Find the `async function processOne(...)` block and make these two targeted changes:

**1. Add after the `const ext = ...` line at the top of processOne:**
```javascript
const langHints = LANG_HINTS[src] || {};
```

**2. In the test generation callAI prompt, add the hint injection:**
```javascript
// BEFORE (current):
`Write a ${testLang === 'python3' ? 'pytest' : testLang === 'go' ? 'Go test' : 'bash'} test script verifying...`

// AFTER:
`Write a ${testLang === 'python3' ? 'pytest' : testLang === 'go' ? 'Go test' : 'bash'} test script verifying that a ${tgtLabel} conversion of this ${srcLabel} script preserves all original functionality.\n${langHints.test ? '\nLanguage-specific test guidance:\n' + langHints.test + '\n' : ''}\nOutput ONLY raw code. Include tests for each behavior, edge cases, and clear test names.\n\nOriginal:\n${code}`
```

**3. In the conversion callAI prompt, add the hint injection:**
```javascript
// Add after the existing REXX conditional and before manualNote:
(langHints.convert ? '\n' + langHints.convert : '')
```

So the full conversion prompt arguments become:
```javascript
`Convert this ${srcLabel} script to ${tgtLabel}. Output ONLY raw ${tgtLabel} code, no fences.` +
(tgt === 'ansible' ? '\nUse official Ansible modules (not shell/command). Every task needs a descriptive name. Use variables for hardcoded values.' : '') +
(tgt === 'python3' ? '\nUse argparse for CLI args. Use subprocess.run() for shell commands.' : '') +
(langHints.convert ? '\n' + langHints.convert : '') +
manualNote + `\n\nScript:\n${code}`
```

The old REXX conditional can be removed — it's now covered by `LANG_HINTS.rexx.convert` and is more complete there.

---

## Part 2 — Full Project Review

### What works well

**The four-step pipeline is the right idea and well-executed.**
Document → Review → Test → Convert is genuinely differentiated from "paste and pray" converters. The complexity scorer surfacing blockers *before* conversion is particularly strong — engineers can make a go/no-go call before committing time. The `# TODO: MANUAL REVIEW` insertion is exactly the right honesty mechanism.

**The single-file constraint is a real asset.**
No build step, no npm, no Docker — it deploys to GitHub Pages and runs on a USB stick. For the conference demo context this is correct: nothing can break during setup that a `python3 launch.py` can't fix.

**The diagnostics panel is production-quality.**
Signal Board, Auto-Detect, and Activity Log cover the three things that go wrong in demos: connectivity, auth, and "what did it actually do." The Re-check button has already proven its value at conference. The decision to avoid opening DevTools during demos was the right call.

**Provider architecture is clean.**
`baseCallAI` → pure transport functions is a solid separation. The `callAI` diagnostic wrapper correctly avoids the infinite recursion trap. Per-provider model caching with bust-on-change is thoughtful. The Ollama context window auto-sizing with hard-block-and-redirect is a good safety net.

**The UI aesthetic is appropriate for the audience.**
Red Hat/enterprise engineers are not impressed by novelty. The clean, neutral palette with semantic color (green/amber/red signals, complexity bar) reads as professional tooling, not a demo toy.

---

### What needs improvement

#### 1. Token budget is the biggest silent failure mode

`max_tokens` defaults to 1000. For any real script beyond ~40 lines, 1000 tokens will truncate the conversion mid-output — often mid-function, mid-task, or mid-block. The model stops, the output looks complete, and the bug isn't obvious until someone tries to run it.

**The fix:** Default should be 4000. Relabel the options to be honest about what they mean:
```
500  — small scripts only (<20 lines)
1000 — short scripts (<50 lines)  [currently misleadingly labeled "default"]
2000 — medium scripts
4000 — recommended for real scripts  ← make this the default
```
The Ollama small-model caveat (currently the reason 500 is listed) should be a tooltip or note, not the reason the default is capped low.

#### 2. PowerShell → Ansible is the weakest conversion path (critical for Monday)

PowerShell is listed as a *target*, not a *source*. There is no PowerShell input support — no sample script, no entry in `SAMPLES`, no file extension in `LEGACY_EXTS` (`.ps1` is absent), and no `LANG_HINTS` entry. If Monday's meeting is about converting PowerShell scripts *to* Ansible, the tool cannot currently accept PowerShell as input at all.

**Immediate actions needed before Monday:**

Add PowerShell as a source language:
```javascript
// In SAMPLES:
powershell: `# deploy.ps1 — deploys an application and configures IIS
param(
  [string]$AppName = "myapp",
  [string]$SourcePath = "C:\\builds\\latest",
  [string]$DestPath = "C:\\inetpub\\wwwroot\\myapp"
)
Stop-Service -Name "W3SVC" -ErrorAction SilentlyContinue
Copy-Item -Path "$SourcePath\\*" -Destination $DestPath -Recurse -Force
Set-ItemProperty -Path "IIS:\\Sites\\Default Web Site\\$AppName" -Name physicalPath -Value $DestPath
Start-Service -Name "W3SVC"
Write-Host "Deployed $AppName to $DestPath"`,

// In the src-lang select:
<option value="powershell">PowerShell</option>

// In LEGACY_EXTS:
'ps1', 'psm1', 'psd1'

// In LANG_HINTS:
powershell: {
  convert: `PowerShell-specific: Cmdlet → Ansible module mapping is the primary task.
Stop-Service/Start-Service → ansible.builtin.service (state: stopped/started).
Copy-Item → ansible.builtin.copy or ansible.builtin.synchronize.
Set-ItemProperty (registry/IIS) → ansible.windows.win_regedit or
community.windows.win_iis_* modules — insert TODO if no module exists.
New-Item -ItemType Directory → ansible.builtin.file (state: directory).
Remove-Item → ansible.builtin.file (state: absent).
Invoke-WebRequest/Invoke-RestMethod → ansible.builtin.uri.
Write-Host/Write-Output → ansible debug: msg: (not a task output).
param() block → Ansible vars or extra_vars — preserve all defaults.
[string]/[int]/[bool] type constraints → Ansible var types or assert.
Try/Catch/Finally → block/rescue/always in Ansible.
$ErrorActionPreference = "Stop" → ignore_errors: no (Ansible default).
$env:VAR → Ansible environment: block or lookup('env', 'VAR').
ForEach-Object / foreach loop → with_items or loop:.
Where-Object → when: condition in tasks.
Select-Object → register + set_fact with filtered content.
Pipeline (cmd | cmd) → registered vars passed between tasks.
[PSCustomObject] → Ansible set_fact with dict.
Windows paths (C:\\path) must be noted — target Ansible may run on Linux
controller against Windows nodes (ansible.windows collection) or natively
on Windows — clarify in output with a comment.`,

  test: `PowerShell-specific: Tests must verify: param() default value behavior,
Stop/Start-Service idempotency (service already in desired state),
Copy-Item recursive behavior and overwrite semantics, error handling
($ErrorActionPreference / Try/Catch) maps correctly to block/rescue,
and any registry or IIS operations — these need Windows test infrastructure
or explicit TODO: REQUIRES WINDOWS. For Ansible output, verify playbook
runs in --check mode without errors. Assert that all param() variables
are correctly wired as Ansible vars/extra_vars.`,
},
```

Add the `onSrcChange()` equivalence check for PowerShell:
```javascript
// No change needed — the existing logic handles it via SAMPLES lookup.
// Just ensure 'powershell' key exists in SAMPLES.
```

#### 3. The SYS prompt is doing too much and too little

The current system prompt:
```
'You are a senior software engineer. Be concise and direct. For documentation
use plain text with labeled sections — no markdown headers or fences.
For code output raw code only, no backtick fences, no preamble.'
```

Problems:
- "Be concise" fights against generating complete conversions of real scripts. A 200-line Bash script needs a 200+ line Ansible playbook — "concise" is the wrong instruction for conversion steps.
- The no-fences instruction is correct but should be the final line, reinforced as a hard rule, not buried.
- The persona "senior software engineer" is generic. For Ansible specifically, "senior Ansible engineer with Bash/PowerShell migration experience" produces measurably better task naming and module selection.

**Recommended: use step-specific system prompts:**
```javascript
const SYS_DOC = 'You are a senior software engineer documenting legacy code for migration. Write thorough, accurate documentation. Plain text with labeled sections — no markdown, no fences.';
const SYS_REVIEW = 'You are a code migration analyst. Respond only with a valid JSON object, no markdown, no explanation.';
const SYS_TEST = 'You are a senior QA engineer writing migration validation tests. Output ONLY raw code. No backtick fences, no preamble, no explanation outside code comments.';
const SYS_CONVERT = 'You are a senior automation engineer specializing in legacy script migration. Output ONLY raw converted code. Absolutely no backtick fences, no preamble, no explanation. If something cannot be converted, insert a # TODO: MANUAL REVIEW comment with a specific reason.';
```

Replace the single `SYS` constant references in each `callAI` call with the appropriate step-specific prompt.

#### 4. Output truncation is invisible to the user

When a model hits `max_tokens` mid-output, the streaming just stops. There's no indicator that the output is incomplete. For a 300-line conversion that cuts off at line 180, the user sees what looks like a complete playbook and may not notice the missing tasks until runtime.

**The fix:** After each `callAI` call in `processOne`, check for truncation signals:
```javascript
// After conversion, add a truncation heuristic:
const looksIncomplete = (text) => {
  const t = text.trimEnd();
  // Ansible: ends without closing the last task block
  // Python: ends mid-function (no final newline after def)
  // General: ends mid-word, mid-string, or on an opening bracket
  return t.endsWith(':') || t.endsWith(',') || t.endsWith('(') ||
         t.endsWith('{') || t.endsWith('[') || t.endsWith('\\');
};

if (looksIncomplete(converted)) {
  // Append a visible warning inside the output
  setOutput('converted', converted + '\n\n# ⚠️  WARNING: Output may be truncated. Increase max_tokens in Settings and re-run.', false);
  setDot('converted', 'dot-warn');
}
```

#### 5. Complexity assessment uses `max_tokens` budget

The JSON complexity assessment is fired through `callAI` with the same token budget as generation. A complexity response is 50-100 tokens. Spending 4000 tokens of budget on a 50-token JSON response wastes time with some providers and can cause rate limit issues in batch mode. The assessment should use a hardcoded low token count, not the user's max_tokens setting.

This requires passing an override to `baseCallAI` or duplicating the call structure for assessment — the cleanest fix is a `callAILite` that forces `max_tokens: 200` for the assessment step.

#### 6. Batch mode has no resume / partial-failure recovery

If a batch of 20 files fails on file 14, the user loses the first 13 results (they're in the UI output which only shows the last file) and must restart the whole queue. The files are marked done in the queue UI but the actual outputs aren't persisted unless an output directory was set.

For now, the minimum viable fix is: **require an output directory before allowing batch runs**, or clearly warn that results not saved to disk will be lost.

#### 7. The `testConnection()` function burns a real API call

"Test connection" calls `callAI` with "Say hello in one short sentence" — this goes through the full diagnostic wrapper and costs tokens/time like a real request. For Ollama it doesn't matter, but for Anthropic/OpenAI/Gemini it burns quota and counts against rate limits. The Auto-Detect panel's lightweight HTTP checks are better — the Test Connection button should use the same approach (a HEAD or minimal models-list request) rather than a generation call.

---

### Monday meeting — PowerShell → Ansible specifically

Beyond the missing source language (addressed above), a few things to know for the meeting:

**The conversion is structurally tractable but the devil is in the module selection.** PowerShell cmdlets map relatively cleanly to Ansible modules when the cmdlets are infrastructure-oriented (services, files, registry, IIS, network). Application-layer PowerShell (COM objects, WMI, .NET reflection, custom PSSnapins) has no clean Ansible equivalent and will need heavy TODO annotation.

**Windows controller vs Linux controller matters.** Ansible can manage Windows nodes from a Linux controller using `ansible.windows` and `community.windows` collections — this is the common enterprise setup. The converted playbook should include a comment noting which collection is assumed, and whether `win_` prefixed modules or cross-platform modules are being used.

**Idempotency is the core Ansible value proposition.** PowerShell scripts are typically imperative and not idempotent. The conversion prompt should explicitly instruct the model to use idempotent Ansible modules (ansible.builtin.service with state: rather than a Start-Service call) and to prefer `creates:` / `removes:` guards on shell tasks. Add this to the Ansible target instruction:

```javascript
(tgt === 'ansible' ? '\nUse official Ansible modules (not shell/command). Every task needs a descriptive name. Use variables for hardcoded values. Prefer idempotent module parameters (state:, creates:, removes:) over imperative shell calls. Add a hosts: and become: block appropriate for the target OS.' : '')
```

**The test script for PowerShell → Ansible should validate idempotency.** A good generated test runs the playbook twice and asserts no changes on the second run (`changed=0`). Add this to `LANG_HINTS.powershell.test`.

---

### Summary table

| Area | Status | Priority |
|---|---|---|
| LANG_HINTS per-language prompts | ✅ Done (above) | High |
| PowerShell as source language | ❌ Missing entirely | **Critical for Monday** |
| max_tokens default too low | ⚠️ 1000 truncates real scripts | High |
| Step-specific system prompts | ⚠️ Single generic SYS | Medium |
| Truncation detection | ❌ Silent failure | Medium |
| Complexity assessment token waste | ⚠️ Minor inefficiency | Low |
| Batch resume / output persistence | ⚠️ Results lost on failure | Medium |
| testConnection() burns quota | ⚠️ Minor UX issue | Low |
