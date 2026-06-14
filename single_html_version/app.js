// ─── Samples ──────────────────────────────────────────────────────
const SAMPLES = {
  bash:`#!/bin/bash\n# backup.sh — backs up /var/data to /mnt/backup with timestamp\nset -euo pipefail\nSRC="/var/data"\nDEST="/mnt/backup/$(date +%Y%m%d_%H%M%S)"\nmkdir -p "$DEST"\ncp -r "$SRC/"* "$DEST/"\nfind "$DEST" -name "*.log" -mtime +30 -delete\necho "Backup complete: $DEST"`,
  perl:`#!/usr/bin/perl\n# parse_logs.pl — counts 5xx errors per IP in Apache log\nuse strict; use warnings;\nmy $logfile = $ARGV[0] or die "Usage: $0 <logfile>\\n";\nmy %counts;\nopen(my $fh,'<',$logfile) or die "Cannot open: $!";\nwhile(<$fh>){ $counts{$1}++ if /^(\\S+).+\\s(5\\d{2})\\s/; }\nclose $fh;\nfor my $ip (sort{$counts{$b}<=>$counts{$a}} keys %counts){\n  printf "%s\\t%d\\n",$ip,$counts{$ip};\n}`,
  powershell:`# server-inventory.ps1 — collects server info and restarts a service with credentials\nparam(\n  [string]$ServiceName = "myapp",\n  [string]$Server      = "localhost"\n)\n$ErrorActionPreference = "Stop"\n\n# Gather hardware info via WMI\n$os  = Get-WmiObject -Class Win32_OperatingSystem -ComputerName $Server\n$cpu = Get-WmiObject -Class Win32_Processor      -ComputerName $Server\n$disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3"\n\nWrite-Host "OS: $($os.Caption) | CPU: $($cpu.Name) | Free disk: $([math]::Round($disk.FreeSpace/1GB,1)) GB"\n\n# Authenticate and restart service\n$cred = Get-Credential -Message "Enter admin credentials for $Server"\n$password = "S3cur3P@ss!"\nInvoke-Command -ComputerName $Server -Credential $cred -ScriptBlock {\n  Restart-Service -Name $using:ServiceName -Force\n  Write-Host "Service restarted."\n}`,
  cobol:`       IDENTIFICATION DIVISION.\n       PROGRAM-ID. CALC-TAX.\n       DATA DIVISION.\n       WORKING-STORAGE SECTION.\n       01 WS-INCOME PIC 9(7)V99.\n       01 WS-TAX    PIC 9(7)V99.\n       PROCEDURE DIVISION.\n           MOVE 55000.00 TO WS-INCOME\n           COMPUTE WS-TAX = WS-INCOME * 0.22\n           DISPLAY "Tax: " WS-TAX\n           STOP RUN.`,
  rexx:`/* REXX */\n/* sysinfo.rex — display basic system info via z/VM CP commands */\nARG username\nIF username = '' THEN username = 'OPERATOR'\nSAY 'Hello,' username'!'\nADDRESS COMMAND 'CP QUERY TIME'\nADDRESS COMMAND 'CP QUERY STORAGE'\nPULL response\nSAY 'Response:' response\nEXIT 0`,
  awk:`#!/usr/bin/awk -f\n# sum_col.awk — sums column 3 grouped by column 1\nBEGIN { FS="," }\nNR > 1 { group[$1] += $3 }\nEND { for(g in group) printf "%s: %.2f\\n",g,group[g] }`,
  fortran:`      PROGRAM STATS\n      IMPLICIT NONE\n      INTEGER I,N\n      REAL X(100),SUMX,MEAN\n      N=5\n      DATA X /3.0,7.0,5.0,9.0,1.0,95*0.0/\n      SUMX=0.0\n      DO 10 I=1,N\n        SUMX=SUMX+X(I)\n   10 CONTINUE\n      MEAN=SUMX/N\n      WRITE(*,*) 'Mean =',MEAN\n      END`,
  tcl:`#!/usr/bin/tclsh\nset hosts {192.168.1.1 192.168.1.2 10.0.0.1}\nforeach host $hosts {\n  set r [catch {exec ping -c 1 -W 1 $host} out]\n  puts "$host: [expr {$r==0?{UP}:{DOWN}}]"\n}`,
  csh:`#!/bin/csh\nset APP="myapp"\nset DIR="/opt/$APP"\nif(-d $DIR) then\n  /etc/init.d/$APP stop\nendif\ncp -r ./dist/* $DIR/\n/etc/init.d/$APP start`
};
const TGT_LABELS={ansible:'Ansible YAML',python3:'Python 3',terraform:'Terraform HCL',go:'Go',powershell:'PowerShell'};
const TGT_EXT={ansible:'yml',python3:'py',terraform:'tf',go:'go',powershell:'ps1'};
const LEGACY_EXTS=['sh','bash','pl','pm','cob','cbl','f','for','f90','f95','awk','tcl','csh','ksh','zsh','rex','rexx','exec','ps1','psm1','psd1'];

let mode='single', queue=[], outputDirHandle=null, batchResults=[];
let provider='ollama';
let lastConversionContext = null;
let conversionHistory = [], historySeq = 0;
let launchPyAvailable = false;

// Model caches — cleared on provider/URL change so stale lists don't linger
let cachedOllamaModels = null;
let cachedOpenAIModels = null;
let cachedGeminiModels = null;

// ─── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const savedProv = localStorage.getItem('rs_provider') || 'ollama';
  // Restore text inputs before setProvider so URL is correct when Ollama fetches
  const ou = localStorage.getItem('rs_ollama_url'); if(ou) document.getElementById('ollama-url').value=ou;
  const gm = localStorage.getItem('rs_gemini_model'); if(gm) document.getElementById('gemini-model').value=gm;
  const oi = localStorage.getItem('rs_openai_model'); if(oi) document.getElementById('openai-model').value=oi;
  const am = localStorage.getItem('rs_anthropic_model'); if(am) document.getElementById('anthropic-model').value=am;
  setProvider(savedProv);
  loadSample();
  renderOllamaCorsCmd();
  setTimeout(() => diagAddLog('INFO', 'Page loaded · provider: ' + provider), 150);
  probeLaunchPy();
});

// ─── Settings ─────────────────────────────────────────────────────
function toggleSettings() { document.getElementById('settings-panel').classList.toggle('open'); }

function setProvider(p) {
  provider = p;
  localStorage.setItem('rs_provider', p);
  document.getElementById('provider-select').value = p;
  document.querySelectorAll('.provider-fields').forEach(el => el.classList.remove('active'));
  document.getElementById('fields-' + p).classList.add('active');
  resetConnStatus();

  // Update chip
  const dot = document.getElementById('chip-dot');
  const label = document.getElementById('chip-label');
  const ctx = document.getElementById('chip-ctx');
  dot.className = 'pchip-dot';
  if (p === 'anthropic') { dot.classList.add('c-orange'); label.textContent = 'Anthropic Claude'; ctx.textContent = '200K ctx'; }
  else if (p === 'openai') { dot.classList.add('c-green'); label.textContent = 'OpenAI GPT'; ctx.textContent = '128K ctx'; }
  else if (p === 'gemini') { dot.classList.add('c-blue'); label.textContent = 'Google Gemini'; ctx.textContent = '1M ctx'; }
  else { dot.classList.add('c-grey'); label.textContent = 'Ollama (local)'; ctx.textContent = 'auto ctx'; }

  diagAddLog('INFO', 'Provider switched to: ' + p);

  // Populate dynamic model dropdowns
  if (p === 'ollama') {
    renderOllamaCorsCmd();
    loadOllamaModels();
  } else if (p === 'openai') {
    loadOpenAIModels();
  } else if (p === 'gemini') {
    loadGeminiModels();
  }

  if (document.getElementById('diag-panel').classList.contains('open')) diagRunAutoDetect();
}

// ─── Ollama model loading ─────────────────────────────────────────
async function fetchOllamaModels() {
  const base = document.getElementById('ollama-url').value.trim().replace(/\/$/, '') || 'http://localhost:11434';
  // Use AbortController so a hung Ollama doesn't block the UI forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let resp;
  try {
    resp = await fetch(base + '/api/tags', { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error('Ollama /api/tags returned HTTP ' + resp.status);
  const data = await resp.json();
  const models = (data.models || []).map(m => m.name);
  if (!models.length) throw new Error('Ollama is running but has no models pulled yet');
  return models;
}

function populateOllamaModelDropdown(models) {
  const select = document.getElementById('ollama-model');
  const manual = document.getElementById('ollama-model-manual');
  select.innerHTML = '';
  manual.style.display = 'none'; // hide manual input when we have real models
  models.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  // Restore saved preference, or prefer a coder model, or first available
  const saved = localStorage.getItem('rs_ollama_model');
  if (saved && models.includes(saved)) {
    select.value = saved;
  } else {
    const best = models.find(m => m.toLowerCase().includes('coder')) || models[0];
    if (best) select.value = best;
  }
}

function ollamaModelFallback(reason) {
  const select = document.getElementById('ollama-model');
  const manual = document.getElementById('ollama-model-manual');
  const saved = localStorage.getItem('rs_ollama_model') || 'qwen2.5-coder';
  select.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = saved;
  opt.textContent = saved + ' (not verified)';
  select.appendChild(opt);
  select.setAttribute('title', reason);
  // Show the manual text input so user can type any model name
  manual.style.display = '';
  manual.value = saved;
  manual.placeholder = 'Type model name (e.g. qwen2.5-coder:7b)';
}

function syncOllamaManual(val) {
  // Keep the select value in sync with what the user types
  const select = document.getElementById('ollama-model');
  if (select.options.length > 0) {
    select.options[0].value = val;
    select.options[0].textContent = val || 'qwen2.5-coder';
    select.value = select.options[0].value;
  }
}

// ─── Ollama CORS command — auto-detects page origin ───────────────
function isNoCorsNeeded() {
  // file:// and localhost origins are already trusted by Ollama — no CORS env var needed
  const proto = window.location.protocol;
  const host = window.location.hostname;
  if (proto === 'file:') return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  return false;
}

function buildOllamaOrigin() {
  if (isNoCorsNeeded()) return null;
  const origin = window.location.origin;
  return (origin === 'null' || origin === '') ? null : origin;
}

function renderOllamaCorsCmd() {
  const origin = buildOllamaOrigin();
  const note = document.getElementById('ollama-cors-note');
  if (!note) return;
  if (origin === null) {
    note.innerHTML = 'Models load automatically from your local Ollama instance. Run <strong>launch.py</strong> to serve locally, then start Ollama with <code style="font-family:var(--mono);">ollama serve</code>.';
  } else {
    note.innerHTML = 'Models load from your local Ollama instance. To allow connections from this page, start Ollama with:<br><code style="font-family:var(--mono);font-size:10.5px;">OLLAMA_ORIGINS="' + origin + '" ollama serve</code>';
  }
}

function copyOllamaCmd() {
  const origin = buildOllamaOrigin();
  const cmd = origin ? 'OLLAMA_ORIGINS="' + origin + '" ollama serve' : 'ollama serve';
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('ollama-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy command', 1800);
  });
}

async function loadOllamaModels() {
  const select = document.getElementById('ollama-model');
  select.innerHTML = '<option disabled>Connecting to Ollama…</option>';
  try {
    if (!cachedOllamaModels) {
      cachedOllamaModels = await fetchOllamaModels();
    }
    populateOllamaModelDropdown(cachedOllamaModels);
    diagAddLog('OK', 'Loaded ' + cachedOllamaModels.length + ' Ollama model(s)');
  } catch (e) {
    cachedOllamaModels = null; // don't cache failures — allow retry
    const isCors = e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('networkerror') || e.name === 'TypeError';
    const isTimeout = e.name === 'AbortError';
    const noCorsSituation = isNoCorsNeeded();
    let hint;
    if (isTimeout) {
      hint = 'timeout — is Ollama running?';
    } else if (isCors) {
      if (noCorsSituation) {
        hint = 'network error — is Ollama running? Try: ollama serve';
      } else {
        const origin = window.location.origin;
        hint = 'CORS blocked from ' + origin + '\nFix: OLLAMA_ORIGINS="' + origin + '" ollama serve';
      }
    } else {
      hint = e.message;
    }
    ollamaModelFallback(hint);
    diagAddLog('ERR', 'Ollama model load failed: ' + hint.replace('\n', ' — '));
  }
}

async function refreshOllamaModels() {
  cachedOllamaModels = null; // bust cache on URL change
  await loadOllamaModels();
}

// ─── Ollama probe — shows raw diagnostic output in the UI ─────────
async function ollamaProbe() {
  const base = document.getElementById('ollama-url').value.trim().replace(/\/$/, '') || 'http://localhost:11434';
  const out = document.getElementById('ollama-probe-result');
  out.style.display = '';
  out.style.color = 'var(--text2)';
  out.textContent = '⏳ Probing ' + base + ' …';

  const steps = [];
  const ok  = s => steps.push('✅ ' + s);
  const err = s => steps.push('❌ ' + s);
  const inf = s => steps.push('ℹ️  ' + s);
  const warn = s => steps.push('⚠️  ' + s);

  // When opened as a local file, the browser sends no Origin header so Ollama
  // never echoes back Access-Control-Allow-Origin — that is expected and fine.
  const isFileOrigin = isNoCorsNeeded();
  const pageOrigin = window.location.protocol === 'file:' ? 'file:// (local)'
    : isFileOrigin ? window.location.origin + ' (localhost — trusted by Ollama)'
    : window.location.origin;
  inf('Page origin: ' + pageOrigin);

  // ── Step 1: root reachability ──
  let rootOk = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(base, { signal: controller.signal });
    clearTimeout(timer);
    const text = await r.text();
    rootOk = true;
    ok('Server reachable — HTTP ' + r.status);
    if (text.toLowerCase().includes('ollama')) ok('Root response looks like Ollama');
    else inf('Root response: ' + text.slice(0, 60));

    // CORS header check — only meaningful for non-file:// origins
    const corsHeader = r.headers.get('access-control-allow-origin');
    if (isFileOrigin) {
      inf('CORS header check skipped — file:// origin does not require it');
    } else if (corsHeader) {
      ok('CORS header present: ' + corsHeader);
    } else {
      err('No Access-Control-Allow-Origin header for origin: ' + pageOrigin);
      inf('Fix: OLLAMA_ORIGINS="' + pageOrigin + '" ollama serve');
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      err('Connection timed out after 4s — is Ollama running?');
    } else if (e instanceof TypeError || e.message.toLowerCase().includes('failed to fetch')) {
      if (isFileOrigin) {
        err('Network error — Ollama may not be running at ' + base);
      } else {
        err('CORS block — browser rejected request from ' + pageOrigin);
        inf('Fix: OLLAMA_ORIGINS="' + pageOrigin + '" ollama serve');
      }
    } else {
      err('Unexpected error: ' + e.message);
    }
    out.innerHTML = steps.join('\n');
    out.style.color = 'var(--text-danger)';
    return;
  }

  // ── Step 2: /api/tags + model load ──
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(base + '/api/tags', { signal: controller.signal });
    clearTimeout(timer);

    // CORS header on /api/tags — again only flag if not file://
    const corsHeader = r.headers.get('access-control-allow-origin');
    if (!isFileOrigin) {
      if (corsHeader) ok('/api/tags CORS header: ' + corsHeader);
      else err('/api/tags missing CORS header — API calls will be blocked from ' + pageOrigin);
    }

    if (!r.ok) { err('/api/tags returned HTTP ' + r.status); out.textContent = steps.join('\n'); return; }
    const data = await r.json();
    const models = (data.models || []).map(m => m.name);
    if (models.length) {
      ok('Found ' + models.length + ' model(s): ' + models.join(', '));
      // Load into dropdown immediately
      cachedOllamaModels = models;
      populateOllamaModelDropdown(models);
      diagAddLog('OK', 'Probe loaded ' + models.length + ' Ollama model(s)');
      // If we got models but CORS was missing, warn about actual API calls failing
      if (!isFileOrigin && !corsHeader) {
        warn('Models listed OK but API calls during conversion will still be blocked');
        warn('Set OLLAMA_ORIGINS and restart Ollama to fix generation');
      }
    } else {
      err('/api/tags returned no models — pull one first');
      inf('Run:  ollama pull qwen2.5-coder');
    }
  } catch (e) {
    if (e.name === 'AbortError') err('/api/tags timed out');
    else err('/api/tags fetch failed: ' + e.message);
  }

  out.textContent = steps.join('\n');
  const hasErr = steps.some(s => s.startsWith('❌'));
  const hasWarn = steps.some(s => s.startsWith('⚠️'));
  out.style.color = hasErr ? 'var(--text-danger)' : hasWarn ? 'var(--text-warn)' : 'var(--text-success)';
}


// ─── Gemini model loading ─────────────────────────────────────────
async function fetchGeminiModels() {
  const key = document.getElementById('gemini-key').value.trim();
  if (!key) return [];
  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
  if (!resp.ok) throw new Error('Gemini models API returned ' + resp.status);
  const data = await resp.json();
  return (data.models || []).filter(m =>
    (m.supportedGenerationMethods || []).includes('generateContent')
  );
}

function populateGeminiModelDropdown(models) {
  const select = document.getElementById('gemini-model');
  const prev = select.value;
  select.innerHTML = '';
  models.forEach(m => {
    const shortName = m.name.replace('models/', '');
    const opt = document.createElement('option');
    opt.value = shortName;
    opt.textContent = m.displayName || shortName;
    select.appendChild(opt);
  });
  // Restore saved preference
  const saved = localStorage.getItem('rs_gemini_model');
  const allVals = models.map(m => m.name.replace('models/', ''));
  if (saved && allVals.includes(saved)) select.value = saved;
  else if (prev && allVals.includes(prev)) select.value = prev;
}

async function loadGeminiModels() {
  const key = document.getElementById('gemini-key').value.trim();
  if (!key) return; // Silently skip — user hasn't entered key yet
  const select = document.getElementById('gemini-model');
  select.innerHTML = '<option disabled>Loading models…</option>';
  try {
    if (!cachedGeminiModels) {
      cachedGeminiModels = await fetchGeminiModels();
    }
    if (cachedGeminiModels.length) {
      populateGeminiModelDropdown(cachedGeminiModels);
      diagAddLog('OK', 'Loaded ' + cachedGeminiModels.length + ' Gemini model(s)');
    } else {
      // Restore static defaults if API returns nothing
      select.innerHTML = '<option value="gemini-1.5-pro">Gemini 1.5 Pro</option><option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option><option value="gemini-2.0-flash">Gemini 2.0 Flash</option>';
      diagAddLog('WARN', 'No Gemini models returned — check API key');
    }
  } catch (e) {
    select.innerHTML = '<option value="gemini-1.5-pro">Gemini 1.5 Pro</option><option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option><option value="gemini-2.0-flash">Gemini 2.0 Flash</option>';
    diagAddLog('ERR', 'Could not load Gemini models: ' + e.message);
  }
}

async function refreshGeminiModels() {
  cachedGeminiModels = null; // bust cache on key change
  await loadGeminiModels();
}

// ─── OpenAI model loading ─────────────────────────────────────────
// Chat-capable model prefixes — filters out embeddings, whisper, dall-e, tts, etc.
const OPENAI_CHAT_PREFIXES = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o3'];
const OPENAI_STATIC_FALLBACK = [
  { id: 'gpt-4o',       label: 'GPT-4o (recommended)' },
  { id: 'gpt-4o-mini',  label: 'GPT-4o mini (fastest)' },
  { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
];

async function fetchOpenAIModels() {
  const key = document.getElementById('openai-key').value.trim();
  if (!key) return [];
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': 'Bearer ' + key }
  });
  if (!resp.ok) throw new Error('OpenAI /v1/models returned ' + resp.status);
  const data = await resp.json();
  return (data.data || [])
    .filter(m => OPENAI_CHAT_PREFIXES.some(prefix => m.id.startsWith(prefix)))
    .sort((a, b) => b.created - a.created) // newest first
    .map(m => ({ id: m.id, label: m.id }));
}

function populateOpenAIModelDropdown(models) {
  const select = document.getElementById('openai-model');
  const prev = select.value;
  select.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    select.appendChild(opt);
  });
  // Restore saved preference
  const saved = localStorage.getItem('rs_openai_model');
  const allIds = models.map(m => m.id);
  if (saved && allIds.includes(saved)) select.value = saved;
  else if (prev && allIds.includes(prev)) select.value = prev;
  else if (allIds.includes('gpt-4o')) select.value = 'gpt-4o';
}

async function loadOpenAIModels() {
  const key = document.getElementById('openai-key').value.trim();
  if (!key) return; // Silently skip — user hasn't entered key yet
  const select = document.getElementById('openai-model');
  select.innerHTML = '<option disabled>Loading models…</option>';
  try {
    if (!cachedOpenAIModels) {
      cachedOpenAIModels = await fetchOpenAIModels();
    }
    if (cachedOpenAIModels.length) {
      populateOpenAIModelDropdown(cachedOpenAIModels);
      diagAddLog('OK', 'Loaded ' + cachedOpenAIModels.length + ' OpenAI chat model(s)');
    } else {
      populateOpenAIModelDropdown(OPENAI_STATIC_FALLBACK);
      diagAddLog('WARN', 'No chat models returned — using defaults');
    }
  } catch (e) {
    populateOpenAIModelDropdown(OPENAI_STATIC_FALLBACK);
    diagAddLog('ERR', 'Could not load OpenAI models: ' + e.message);
  }
}

async function refreshOpenAIModels() {
  cachedOpenAIModels = null; // bust cache on key change
  await loadOpenAIModels();
}

function savePrefs() {
  localStorage.setItem('rs_anthropic_model', document.getElementById('anthropic-model').value);
  localStorage.setItem('rs_ollama_url', document.getElementById('ollama-url').value);
  localStorage.setItem('rs_ollama_model', document.getElementById('ollama-model').value);
  localStorage.setItem('rs_gemini_model', document.getElementById('gemini-model').value);
  localStorage.setItem('rs_openai_model', document.getElementById('openai-model').value);
}

function toggleVis(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

function resetConnStatus() {
  document.getElementById('conn-dot').className = 'conn-dot';
  document.getElementById('conn-label').textContent = 'Not tested';
}
function showConnStatus(msg, ok, err) {
  document.getElementById('conn-dot').className = 'conn-dot' + (ok ? ' ok' : err ? ' err' : '');
  document.getElementById('conn-label').textContent = msg;
}

async function testConnection() {
  showConnStatus('Testing…', false, false);
  savePrefs();
  try {
    // Use lightweight connectivity checks — no generation tokens consumed
    if (provider === 'ollama') {
      const base = document.getElementById('ollama-url').value.trim().replace(/\/$/, '');
      const r = await fetch(base + '/api/tags');
      if (!r.ok) throw new Error('Ollama returned HTTP ' + r.status);
      const data = await r.json();
      const count = (data.models || []).length;
      showConnStatus('Connected — ' + count + ' model(s) available', true, false);
    } else if (provider === 'anthropic') {
      const key = document.getElementById('anthropic-key').value.trim();
      if (!key) throw new Error('No API key set');
      const model = document.getElementById('anthropic-model').value;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 5, stream: false, messages: [{ role: 'user', content: 'hi' }] })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || 'HTTP ' + r.status); }
      showConnStatus('Connected — Anthropic API reachable', true, false);
    } else if (provider === 'openai') {
      const key = document.getElementById('openai-key').value.trim();
      if (!key) throw new Error('No API key set');
      const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      showConnStatus('Connected — OpenAI API reachable', true, false);
    } else if (provider === 'gemini') {
      const key = document.getElementById('gemini-key').value.trim();
      if (!key) throw new Error('No API key set');
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      showConnStatus('Connected — Gemini API reachable', true, false);
    }
  } catch (e) {
    showConnStatus('Failed: ' + e.message, false, true);
  }
}

// ─── Ollama context check ─────────────────────────────────────────
async function checkOllamaContext(code) {
  const estimatedTokens = Math.ceil(code.length / 4);
  const banner = document.getElementById('ctx-banner');
  banner.className = 'ctx-banner';

  if (provider !== 'ollama') return { ok: true, estimatedTokens, numCtx: null };

  const base = document.getElementById('ollama-url').value.trim().replace(/\/$/, '');
  let currentCtx = 4096;
  try {
    const ps = await fetch(base + '/api/ps').then(r => r.json());
    const loaded = ps?.models?.[0];
    if (loaded?.model) {
      const info = await fetch(base + '/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: loaded.model }) }).then(r => r.json());
      currentCtx = info?.model_info?.['llama.context_length'] || info?.parameters?.num_ctx || 4096;
    }
  } catch {}

  const totalNeeded = estimatedTokens + 2048;
  if (totalNeeded <= currentCtx) return { ok: true, estimatedTokens, numCtx: null };

  const MAX_SAFE_CTX = 8192;
  if (totalNeeded <= MAX_SAFE_CTX) {
    const newCtx = Math.min(totalNeeded + 1024, MAX_SAFE_CTX);
    banner.className = 'ctx-banner show ctx-amber';
    banner.innerHTML = `<strong>&#9888; Large script — auto-expanding context</strong>Script is ~${estimatedTokens.toLocaleString()} tokens. Scripts over 300 lines are best processed with a cloud provider for reliable output quality. Expanding Ollama context to ${newCtx.toLocaleString()} — results may be degraded.`;
    return { ok: true, estimatedTokens, numCtx: newCtx, warned: true };
  }

  banner.className = 'ctx-banner show ctx-red';
  banner.innerHTML = `<strong>&#9940; Script too large for Ollama resources</strong>~${estimatedTokens.toLocaleString()} tokens exceeds your model's safe context (~${currentCtx.toLocaleString()}). Switch to a cloud provider for this conversion.<br><br><button class="btn btn-sm" onclick="document.getElementById('settings-panel').classList.add('open');document.getElementById('provider-select').focus()">&#9881; Switch provider in Settings</button>`;
  return { ok: false, estimatedTokens };
}

// ─── AI providers — pure router (no side effects) ─────────────────
async function baseCallAI(system, user, onChunk) {
  switch (provider) {
    case 'anthropic': return callAnthropic(system, user, onChunk);
    case 'openai':    return callOpenAI(system, user, onChunk);
    case 'gemini':    return callGemini(system, user, onChunk);
    case 'ollama':    return callOllama(system, user, onChunk);
    default: throw new Error('Unknown provider: ' + provider);
  }
}

async function callAnthropic(system, user, onChunk) {
  const key = document.getElementById('anthropic-key').value.trim();
  if (!key) throw new Error('No Anthropic API key set. Open Settings and enter your key.');
  const model = document.getElementById('anthropic-model').value;
  const maxTok = parseInt(document.getElementById('max-tokens').value);
  const temp = parseFloat(document.getElementById('temperature').value);
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: maxTok, stream: true, temperature: temp, system, messages: [{ role: 'user', content: user }] })
  });
  if (!resp.ok) { const e = await resp.json().catch(() => ({ error: { message: resp.statusText } })); throw new Error(e?.error?.message || 'Anthropic error ' + resp.status); }
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue; const d = line.slice(6).trim(); if (d === '[DONE]') continue;
      try { const delta = JSON.parse(d)?.delta?.text || ''; if (delta) { full += delta; onChunk(full); } } catch {}
    }
  }
  return full;
}

async function callOpenAI(system, user, onChunk) {
  const key = document.getElementById('openai-key').value.trim();
  if (!key) throw new Error('No OpenAI API key set. Open Settings and enter your key.');
  const model = document.getElementById('openai-model').value;
  const maxTok = parseInt(document.getElementById('max-tokens').value);
  const temp = parseFloat(document.getElementById('temperature').value);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, max_tokens: maxTok, stream: true, temperature: temp, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  if (!resp.ok) { const e = await resp.json().catch(() => ({ error: { message: resp.statusText } })); throw new Error(e?.error?.message || 'OpenAI error ' + resp.status); }
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue; const d = line.slice(6).trim(); if (d === '[DONE]') continue;
      try { const delta = JSON.parse(d)?.choices?.[0]?.delta?.content || ''; if (delta) { full += delta; onChunk(full); } } catch {}
    }
  }
  return full;
}

async function callGemini(system, user, onChunk) {
  const key = document.getElementById('gemini-key').value.trim();
  if (!key) throw new Error('No Gemini API key set. Open Settings and enter your key.');
  const model = document.getElementById('gemini-model').value;
  const maxTok = parseInt(document.getElementById('max-tokens').value);
  const temp = parseFloat(document.getElementById('temperature').value);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':streamGenerateContent?alt=sse&key=' + key;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTok, temperature: temp }
    })
  });
  if (!resp.ok) { const e = await resp.json().catch(() => ({ error: { message: resp.statusText } })); throw new Error(e?.error?.message || 'Gemini error ' + resp.status); }
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue; const d = line.slice(6).trim();
      try { const delta = JSON.parse(d)?.candidates?.[0]?.content?.parts?.[0]?.text || ''; if (delta) { full += delta; onChunk(full); } } catch {}
    }
  }
  return full;
}

async function callOllama(system, user, onChunk, numCtx) {
  const base = document.getElementById('ollama-url').value.trim().replace(/\/$/, '');
  const model = document.getElementById('ollama-model').value.trim();
  const maxTok = parseInt(document.getElementById('max-tokens').value);
  const temp = parseFloat(document.getElementById('temperature').value);
  const body = { model, stream: true, temperature: temp, max_tokens: maxTok, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (numCtx) body.options = { num_ctx: numCtx };
  const resp = await fetch(base + '/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ollama' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Ollama error ' + resp.status + ' — is Ollama running with CORS enabled?');
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue; const d = line.slice(6).trim(); if (d === '[DONE]') continue;
      try { const delta = JSON.parse(d)?.choices?.[0]?.delta?.content || ''; if (delta) { full += delta; onChunk(full); } } catch {}
    }
  }
  return full;
}

// ─── callAI — diagnostic wrapper (no recursion) ───────────────────
async function callAI(system, user, onChunk) {
  const t0 = Date.now();
  try {
    const result = await baseCallAI(system, user, onChunk);
    const ms = Date.now() - t0;
    diagSessionStats.requests++;
    diagSessionStats.totalMs += ms;
    diagSessionStats.lastMs = ms;
    const slow = ms > 8000;
    const empty = !result || result.trim().length === 0;
    diagSet('api',     'green', 'responding');
    diagSet('auth',    'green', 'accepted');
    diagSet('speed',   slow ? 'amber' : 'green', slow ? `slow (${(ms/1000).toFixed(1)}s)` : `${(ms/1000).toFixed(1)}s`);
    diagSet('stream',  'green', 'completed cleanly');
    diagSet('output',  empty ? 'amber' : 'green', empty ? 'empty response' : 'valid');
    diagSet('complete','green', 'ended normally');
    diagSet('errors',  diagSessionStats.errors === 0 ? 'green' : diagSessionStats.errors < 3 ? 'amber' : 'red', `${diagSessionStats.errors} error${diagSessionStats.errors !== 1 ? 's' : ''}`);
    diagSet('rate',    'green', 'no 429s');
    diagFirstRun = true;
    diagRefreshBoard();
    diagAddLog('OK', `${provider} · ${(ms/1000).toFixed(1)}s · ~${Math.ceil((result||'').length/4)} tokens`, ms);
    return result;
  } catch (e) {
    const ms = Date.now() - t0;
    diagSessionStats.errors++;
    const is401 = e.message.includes('401') || e.message.toLowerCase().includes('unauthorized') || e.message.toLowerCase().includes('api key');
    const isNetwork = e.message.toLowerCase().includes('network') || e.message.toLowerCase().includes('fetch') || e.message.toLowerCase().includes('unreachable');
    const is429 = e.message.includes('429') || e.message.toLowerCase().includes('rate');
    diagSet('api',     isNetwork ? 'red' : 'green', isNetwork ? 'unreachable' : 'reached');
    diagSet('auth',    is401 ? 'red' : 'grey', is401 ? '401 Unauthorized' : '—');
    diagSet('speed',   'red', 'failed');
    diagSet('stream',  'red', 'error');
    diagSet('output',  'red', 'no response');
    diagSet('complete','red', 'did not complete');
    diagSet('errors',  diagSessionStats.errors < 3 ? 'amber' : 'red', `${diagSessionStats.errors} error${diagSessionStats.errors !== 1 ? 's' : ''}`);
    diagSet('rate',    is429 ? 'red' : 'green', is429 ? 'rate limited' : 'ok');
    diagFirstRun = true;
    diagRefreshBoard();
    diagAddLog('ERR', `${provider} error: ${e.message}`, ms);
    throw e;
  }
}

// ─── Mode / UI ────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('btn-single').classList.toggle('active', m === 'single');
  document.getElementById('btn-batch').classList.toggle('active', m === 'batch');
  document.getElementById('single-panel').classList.toggle('hidden', m !== 'single');
  document.getElementById('batch-panel').classList.toggle('hidden', m !== 'batch');
  document.getElementById('run-label').textContent = m === 'single' ? 'Generate documentation, tests & converted code' : 'Process queue';
  document.getElementById('summary-panel').classList.remove('show');
}
function loadSample() { document.getElementById('code-input').value = SAMPLES[document.getElementById('src-lang').value] || SAMPLES.bash; }
function onSrcChange() {
  const v = document.getElementById('code-input').value.trim();
  if (!v || Object.values(SAMPLES).includes(v)) loadSample();
  onCodeInput();
}
function onCodeInput() {
  const src = document.getElementById('src-lang').value;
  const banner = document.getElementById('warn-banner');
  if (src !== 'powershell') { banner.className = 'warn-banner'; return; }
  const code = document.getElementById('code-input').value;
  const findings = scanPowerShell(code);
  if (findings.length) showPreflightWarnings(findings);
  else banner.className = 'warn-banner';
}
function isLegacy(name) { return LEGACY_EXTS.includes(name.split('.').pop().toLowerCase()); }
function switchTab(tab) {
  ['docs', 'tests', 'converted'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('panel-' + t).classList.toggle('hidden', t !== tab);
  });
}
function toggleDiffView() {
  const single = document.getElementById('converted-single');
  const diffView = document.getElementById('diff-view');
  const btn = document.getElementById('diff-btn');
  const opening = !diffView.classList.contains('show');
  diffView.classList.toggle('show', opening);
  single.style.display = opening ? 'none' : '';
  if (btn) btn.textContent = opening ? '☰ Single view' : '⇔ Side-by-side';
  if (opening) {
    const src = document.getElementById('src-lang');
    const tgt = document.getElementById('tgt-lang');
    document.getElementById('diff-src-lang').textContent = src.options[src.selectedIndex].text;
    document.getElementById('diff-tgt-lang').textContent = tgt.options[tgt.selectedIndex].text;
    document.getElementById('diff-original').textContent = document.getElementById('code-input').value;
    document.getElementById('diff-converted').textContent = document.getElementById('out-converted').textContent;
  }
}
function resetDiffView() {
  document.getElementById('diff-view').classList.remove('show');
  document.getElementById('converted-single').style.display = '';
}
function setDot(tab, cls) { document.getElementById('ind-' + tab).innerHTML = cls ? `<span class="tab-dot ${cls}"></span>` : ''; }
function showStatus(msg, spinning) {
  const r = document.getElementById('status-row');
  r.innerHTML = msg ? (spinning ? `<div class="spinner"></div><span>${msg}</span>` : `<span>${msg}</span>`) : '';
}

function setOutput(tab, text, prose) {
  const el = document.getElementById('out-' + tab);
  const acts = document.getElementById('acts-' + tab);
  el.className = 'out-box' + (prose ? ' prose' : '');
  if (tab === 'converted') {
    const fp = document.getElementById('fix-panel');
    fp.classList.toggle('show', !!text);
    if (!text) document.getElementById('fix-status').innerHTML = '';
  }
  if (!text) {
    el.innerHTML = `<span class="placeholder">${tab === 'docs' ? 'Documentation' : tab === 'tests' ? 'Test script' : 'Converted code'} will appear here.</span>`;
    acts.innerHTML = ''; return;
  }
  el.textContent = text;
  el.scrollTop = el.scrollHeight;
  acts.innerHTML = '';
  const cp = document.createElement('button'); cp.className = 'btn btn-sm'; cp.textContent = 'Copy';
  cp.onclick = () => { navigator.clipboard.writeText(text).then(() => { cp.textContent = 'Copied!'; setTimeout(() => cp.textContent = 'Copy', 1500); }); };
  acts.appendChild(cp);
  if (text.length > 100) {
    const dl = document.createElement('button'); dl.className = 'btn btn-sm'; dl.textContent = 'Download';
    const exts = { docs: 'txt', tests: 'sh', converted: TGT_EXT[document.getElementById('tgt-lang').value] || 'txt' };
    dl.onclick = () => downloadText(text, 'rosetta_' + tab + '.' + exts[tab]);
    acts.appendChild(dl);
  }
  const clr = document.createElement('button'); clr.className = 'btn btn-sm'; clr.textContent = 'Clear';
  clr.style.color = 'var(--text3)';
  clr.onclick = () => setOutput(tab, '', prose);
  acts.appendChild(clr);
  if (tab === 'converted') {
    const db = document.createElement('button'); db.id = 'diff-btn'; db.className = 'btn btn-sm';
    const diffOpen = document.getElementById('diff-view').classList.contains('show');
    db.textContent = diffOpen ? '☰ Single view' : '⇔ Side-by-side';
    db.onclick = toggleDiffView;
    acts.appendChild(db);
    if (diffOpen) document.getElementById('diff-converted').textContent = text;
  }
}

function downloadText(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function showComplexity(score, label, level) {
  document.getElementById('complexity-wrap').style.display = '';
  document.getElementById('cb-score-label').textContent = label;
  const fill = document.getElementById('cb-fill');
  fill.style.width = score + '%';
  fill.className = 'cb-fill ' + ({ low: 'fill-green', medium: 'fill-amber', high: 'fill-red' }[level]);
}
function showWarning(level, issues) {
  const el = document.getElementById('warn-banner');
  if (!issues || !issues.length) { el.className = 'warn-banner'; return; }
  el.className = 'warn-banner show ' + (level === 'high' ? 'warn-red' : 'warn-amber');
  const title = level === 'high' ? '&#9888; Manual intervention required' : '&#9888; Partial conversion — review recommended';
  el.innerHTML = `<strong>${title}</strong>${issues.map(i => `&bull; ${i}`).join('<br>')}`;
}

// ─── Queue / File I/O ─────────────────────────────────────────────
function addToQueue(name, content) { if (queue.find(f => f.name === name)) return; queue.push({ name, content, status: 'pending' }); renderQueue(); }
function removeFromQueue(i) { queue.splice(i, 1); renderQueue(); }
function clearQueue() { queue = []; renderQueue(); }
function renderQueue() {
  const list = document.getElementById('queue-list');
  document.getElementById('queue-count').textContent = queue.length + ' file' + (queue.length === 1 ? '' : 's');
  if (!queue.length) { list.innerHTML = '<div class="queue-empty">No files added yet</div>'; return; }
  list.innerHTML = '';
  const stMap = { pending: 'st-pending', running: 'st-running', done: 'st-done', warn: 'st-warn', error: 'st-error' };
  const stTxt = { pending: 'queued', running: 'processing…', done: 'done', warn: 'needs review', error: 'error' };
  queue.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'queue-item';
    row.innerHTML = `<span class="fname" title="${f.name}">${f.name}</span>` +
      `<span class="qi-badge ${stMap[f.status]}">${stTxt[f.status]}</span>` +
      (f.status === 'pending' ? `<button class="qi-remove" onclick="removeFromQueue(${i})" aria-label="Remove">&times;</button>` : '');
    list.appendChild(row);
  });
}
async function pickDirectory() {
  try {
    const dh = await window.showDirectoryPicker({ mode: 'read' }); let c = 0;
    for await (const e of dh.values()) if (e.kind === 'file' && isLegacy(e.name)) { const f = await e.getFile(); addToQueue(f.name, await f.text()); c++; }
    if (!c) showStatus('No recognized legacy files found in that directory.', false);
  } catch (e) { if (e.name !== 'AbortError') showStatus('Directory access failed: ' + e.message, false); }
}
async function handleFilePicker(input) { for (const f of input.files) if (isLegacy(f.name)) addToQueue(f.name, await f.text()); input.value = ''; }
async function handleDrop(e) {
  e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over');
  for (const item of [...e.dataTransfer.items]) {
    if (item.kind !== 'file') continue;
    if (item.getAsFileSystemHandle) {
      const h = await item.getAsFileSystemHandle();
      if (h.kind === 'directory') { for await (const en of h.values()) if (en.kind === 'file' && isLegacy(en.name)) { const f = await en.getFile(); addToQueue(f.name, await f.text()); } }
      else { const f = await h.getFile(); if (isLegacy(f.name)) addToQueue(f.name, await f.text()); }
    } else { const f = item.getAsFile(); if (f && isLegacy(f.name)) addToQueue(f.name, await f.text()); }
  }
}
async function pickOutputDir() {
  try { outputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); document.getElementById('out-dir-name').textContent = outputDirHandle.name + '/'; }
  catch (e) { if (e.name !== 'AbortError') showStatus('Could not access output directory.', false); }
}
async function saveFile(base, suffix, content) {
  if (!outputDirHandle) return;
  try { const fh = await outputDirHandle.getFileHandle(base + suffix, { create: true }); const w = await fh.createWritable(); await w.write(content); await w.close(); } catch (e) { console.warn('Save failed:', e); }
}

// ─── Step-specific system prompts ────────────────────────────────
const SYS_DOC     = 'You are a senior software engineer documenting legacy code for migration. Write thorough, accurate documentation covering all behaviors and edge cases. Use plain text with labeled sections — no markdown headers, no backtick fences, no bullet symbols.';
const SYS_REVIEW  = 'You are a code migration analyst. Respond only with a valid JSON object, no markdown, no explanation, no backtick fences.';
const SYS_TEST    = 'You are a senior QA engineer writing migration validation tests. Your only job is to produce a complete, runnable test script. Output ONLY raw code. Absolutely no backtick fences, no preamble, no explanation outside of code comments. Do not truncate — write every test completely.';
const SYS_CONVERT = 'You are a senior automation engineer specializing in legacy script migration to modern infrastructure-as-code. Output ONLY the converted code — no backtick fences, no preamble, no explanation, no commentary before or after the code. If something cannot be converted cleanly, insert a # TODO: MANUAL REVIEW comment at that exact location with a specific reason. Write the complete output — never truncate.';

// ─── Language-specific prompt hints ──────────────────────────────
const LANG_HINTS = {
  bash: {
    convert: `Bash-specific: Preserve pipelines — pipe chains map to registered vars + subsequent tasks in Ansible, or chained calls in Python/Go. set -euo pipefail semantics map to ignore_errors: no in Ansible, raise on non-zero in Python. Brace expansion and glob patterns need explicit equivalents. Here-docs map to ansible.builtin.copy content: blocks or Python triple-quoted strings. Process substitution <() has no clean equivalent — insert TODO. $() command substitution maps to register: in Ansible. Trap/signal handling needs explicit mapping or TODO.`,
    test: `Bash-specific: Tests must verify exit code behavior under set -e, pipeline failure propagation, glob expansion results, and any trap/cleanup handlers. For Ansible targets, verify registered vars contain expected stdout. Assert on side effects: files created, directories changed, permissions set.`,
  },
  perl: {
    convert: `Perl-specific: $_ implicit variable must be made explicit in all targets. @_ in subroutines maps to function parameters. Special variables: $! (errno) → OSError, $@ (eval error) → try/except, $/ (input record separator) → file read mode, $0 → sys.argv[0]. Regex with /g modifier in while loops → re.finditer() or findall(). die → raise RuntimeError. Perl references and dereferencing ($$ref, @$ref, %$ref) need care. CPAN module usage must be mapped to stdlib equivalents or flagged with TODO. Hash slices (@hash{@keys}) need explicit loops in most targets.`,
    test: `Perl-specific: Tests must cover regex capture group behavior and /g loop semantics, die/eval error handling, file handle open/close and $! error states, hash and array reference dereferencing, any CPAN module behavior being replaced, and $/ separator edge cases.`,
  },
  powershell: {
    convert: `PowerShell-specific: Map cmdlets to Ansible modules wherever possible — never use ansible.builtin.shell when a proper module exists.
Stop-Service / Start-Service → ansible.builtin.service (state: stopped / started).
Restart-Service → ansible.builtin.service (state: restarted).
Copy-Item → ansible.builtin.copy or ansible.builtin.synchronize.
New-Item -ItemType Directory → ansible.builtin.file (state: directory).
Remove-Item → ansible.builtin.file (state: absent).
Test-Path → ansible.builtin.stat + when: condition.
Set-ItemProperty (registry) → ansible.windows.win_regedit — insert TODO if uncertain.
IIS operations → community.windows.win_iis_* modules — insert TODO if no module exists.
Invoke-WebRequest / Invoke-RestMethod → ansible.builtin.uri.
Write-Host / Write-Output → ansible.builtin.debug (msg:).
param() block → Ansible vars: or extra_vars — preserve all parameter defaults.
[string]/[int]/[bool] type constraints → document in var comments.
Try/Catch/Finally → block: / rescue: / always: in Ansible.
$ErrorActionPreference = "Stop" → ignore_errors: no (Ansible default, state explicitly).
$env:VAR → lookup('env', 'VAR') or environment: block.
ForEach-Object / foreach loop → loop: in Ansible.
Where-Object → when: condition on tasks.
Pipeline (cmd | cmd) → register output of first task, reference in second.
Windows paths (C:\\path) → note whether Ansible runs on Linux controller targeting Windows nodes (ansible.windows collection) or natively on Windows — add a comment clarifying assumed setup.
Prefer idempotent module parameters (state:, creates:, removes:) over imperative shell calls. Every task must have a descriptive name:.
Add a hosts: and become: block appropriate for the target OS at the top of the playbook.

WMI / CIM — CRITICAL: Get-WmiObject and Get-CimInstance have NO direct Ansible module equivalent.
Every occurrence MUST get a # TODO: MANUAL REVIEW — WMI/CIM comment with the specific class name.
Map common classes where a module exists:
  Win32_Service → ansible.builtin.service or ansible.windows.win_service.
  Win32_Process → ansible.windows.win_command or ansible.windows.win_shell.
  Win32_Product (software inventory) → ansible.windows.win_package — insert TODO, this is slow and unreliable.
  Win32_NetworkAdapterConfiguration → ansible.windows.win_dns_client or TODO.
  CIM_* classes with no module equivalent → ansible.windows.win_shell with powershell: true + TODO.
Never silently drop a WMI/CIM call — always surface it as a TODO so a human can validate.

Credentials / Secrets — CRITICAL: Never emit plaintext credentials in the converted output.
Get-Credential → # TODO: MANUAL REVIEW — replace with Ansible Vault encrypted variable. Add a vars_files: reference to a vault file and document the expected variable name.
[PSCredential] / New-Object PSCredential → same as above — Ansible Vault var.
ConvertTo-SecureString -AsPlainText → # TODO: MANUAL REVIEW — plaintext secret detected. Move to Ansible Vault immediately. Never include the literal value.
ConvertFrom-SecureString → # TODO: MANUAL REVIEW — encrypted string storage. Use Ansible Vault instead.
$password / $passwd / $secret / $apikey / $token variable names containing literal values → # TODO: MANUAL REVIEW — potential plaintext secret. Move to Ansible Vault.
Where Vault is referenced, add a comment showing the expected ansible-vault command: ansible-vault encrypt_string 'value' --name 'var_name'`,
    test: `PowerShell-specific: Tests must verify param() default value behavior, Stop/Start-Service idempotency (service already in desired state — no change on second run), Copy-Item recursive behavior and overwrite semantics, error handling ($ErrorActionPreference / Try/Catch) maps correctly to block/rescue, and any registry or IIS operations (flag as TODO: REQUIRES WINDOWS if untestable). For Ansible output: verify playbook runs cleanly in --check mode, and assert that running the playbook twice produces changed=0 on the second run (idempotency check). Assert that all param() variables are correctly wired as Ansible vars/extra_vars.
WMI/CIM: Every Get-WmiObject / Get-CimInstance occurrence must have a corresponding test that either validates the replacement module behavior or is explicitly marked TODO: REQUIRES WINDOWS — MANUAL VALIDATION.
Credentials: Assert that NO test contains a plaintext password or secret value. All credential references must use a mock vault variable or environment variable placeholder.`,
  },
  cobol: {
    convert: `COBOL-specific: WORKING-STORAGE variables → playbook vars or typed Python variables. Map PIC 9(n)V99 implied-decimal fields explicitly — do NOT silently truncate decimal precision. PERFORM → function or loop. PERFORM UNTIL tests before executing (like while, not do-while). COMPUTE → arithmetic. MOVE → assignment. EVALUATE → match/case or if/elif. FILE SECTION / OPEN / READ / WRITE → file I/O — never silently drop file operations. COPY (copybook) → cannot be resolved without source — always insert TODO: MANUAL REVIEW with the copybook name. VSAM → TODO. CALL → subprocess or TODO. STRING/UNSTRING → string split/join. INSPECT → re.sub(). Level-88 condition names → named constants or Enum.`,
    test: `COBOL-specific: Tests MUST verify decimal precision — PIC V-notation implied decimals are the most common conversion bug. Assert on PERFORM loop iteration counts, EVALUATE branch coverage, MOVE numeric truncation behavior, STRING/UNSTRING delimiter handling, and any file I/O operations. Flag any test requiring a copybook as TODO: NEEDS COPYBOOK.`,
  },
  rexx: {
    convert: `REXX-specific: ADDRESS COMMAND executes host OS commands → ansible.builtin.shell or subprocess.run(). ADDRESS TSO/ISPF/CMS/CP are z/VM or TSO environment-specific → ansible.builtin.shell with a note, or TODO if no Linux equivalent. EXECIO * DISKR reads all lines, EXECIO * DISKW writes all lines → file read/write. SAY → print() or ansible debug: msg:. ARG uppercases all input by default — account for this in string comparisons. PULL reads from stdin (also uppercases). PARSE ARG/PULL/VAR → explicit string splitting. Stem variables (array.0 = count, array.1..n = values) → list or dict. SIGNAL ON ERROR → try/except. INTERPRET (dynamic eval) → always TODO.`,
    test: `REXX-specific: Tests must verify ARG uppercasing behavior, SAY output capture, EXECIO file read/write round-trips, stem variable indexing (array.0 is count), PARSE ARG tokenization. Flag any test requiring z/VM as TODO: REQUIRES Z/VM.`,
  },
  fortran: {
    convert: `Fortran-specific: IMPLICIT NONE — all variables explicitly typed, preserve types precisely. DO loop with label (DO 10 I=1,N / 10 CONTINUE) → for i in range(1, n+1). Fortran is 1-indexed — adjust all array accesses for 0-indexed targets. COMMON blocks → module-level variables or config dict + TODO. EQUIVALENCE → always TODO. WRITE(*,*) and FORMAT → print() with f-strings. SUBROUTINE/FUNCTION → def or func. INTENT(IN/OUT/INOUT) → document in docstring. Whole-array arithmetic → NumPy or explicit loops. OPEN/CLOSE/READ/WRITE file units → with open() blocks. GOTO → restructure as loop/break or TODO. DATA statement initializers → variable declarations with initial values.`,
    test: `Fortran-specific: Tests MUST verify floating-point precision — Fortran REAL vs Python float can produce different rounding. Assert on loop bounds (1-indexed source vs 0-indexed target — off-by-one is the most common Fortran conversion bug), WRITE format output, array operation results, and SUBROUTINE INTENT(OUT) side effects.`,
  },
  awk: {
    convert: `AWK-specific: BEGIN block → setup/init before main loop. END block → teardown/summary after loop. Pattern { action } → if (condition): inside a line-iteration loop. FS → split() delimiter. NR → enumerate() index + 1. NF → len(fields). $0 → full line. $1..$n → fields[0]..fields[n-1] (0-indexed). printf → f-string or fmt.Printf(). getline → file read or subprocess. Associative arrays → dict. Multiple input files → sys.argv or playbook with_items.`,
    test: `AWK-specific: Tests must verify FS delimiter handling, NR/NF edge cases (empty lines, trailing fields), BEGIN/END execution order, associative array accumulation, printf format output, and multi-file behavior. Assert numeric vs string comparison behavior.`,
  },
  tcl: {
    convert: `Tcl-specific: Everything is a string — make type coercion explicit in the target. set var value → assignment. puts → print() or debug: msg:. exec → subprocess.run() or ansible.builtin.shell. foreach item $list → for item in list. proc → def or func. lindex/lappend/llength → list methods. string commands → str methods. regexp/regsub → re module. catch {cmd} result → try/except. after ms → time.sleep(ms/1000). Tk (GUI) calls cannot be converted — always TODO. package require → import with TODO if no equivalent.`,
    test: `Tcl-specific: Tests must verify string coercion edge cases, list operation results, regexp capture group behavior, catch/error propagation, exec command output and return code, and foreach over multi-element lists. Any Tk/GUI proc must be flagged TODO: UNTESTABLE WITHOUT DISPLAY.`,
  },
  csh: {
    convert: `C Shell-specific: csh differs significantly from bash. set var = value → assignment. setenv VAR value → os.environ or Ansible environment: block. foreach var (list) ... end → for loop. while (condition) ... end → while. if (-d path) / if (-f path) → os.path.isdir() / isfile() or ansible.builtin.stat. $status → return code check. $argv → sys.argv or Ansible vars. Aliases → functions or remove. history and job control → cannot be converted, insert TODO. csh arithmetic uses @ var = expr, not $(( )).`,
    test: `C Shell-specific: Tests must verify environment variable propagation (setenv), exit status ($status) checking, file test operator results (-d, -f, -r, -w, -x), foreach list iteration with edge cases, and argv handling. Assert converted environment variables are visible to child processes.`,
  },
};

// ─── callAILite — low-token call for JSON assessment only ─────────
async function callAILite(system, user) {
  // Uses a hardcoded low token ceiling — never affected by the user's max_tokens setting.
  // Called only for the complexity JSON assessment (expected output: ~50-100 tokens).
  const t0 = Date.now();
  const LITE_MAX = 300;
  let result;
  switch (provider) {
    case 'anthropic': {
      const key = document.getElementById('anthropic-key').value.trim();
      if (!key) throw new Error('No Anthropic API key set.');
      const model = document.getElementById('anthropic-model').value;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: LITE_MAX, stream: false, temperature: 0.1, system, messages: [{ role: 'user', content: user }] })
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e?.error?.message || 'Anthropic error ' + resp.status); }
      const data = await resp.json();
      result = data?.content?.[0]?.text || '';
      break;
    }
    case 'openai': {
      const key = document.getElementById('openai-key').value.trim();
      if (!key) throw new Error('No OpenAI API key set.');
      const model = document.getElementById('openai-model').value;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: LITE_MAX, stream: false, temperature: 0.1, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e?.error?.message || 'OpenAI error ' + resp.status); }
      const data = await resp.json();
      result = data?.choices?.[0]?.message?.content || '';
      break;
    }
    case 'gemini': {
      const key = document.getElementById('gemini-key').value.trim();
      if (!key) throw new Error('No Gemini API key set.');
      const model = document.getElementById('gemini-model').value;
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
      const resp = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: LITE_MAX, temperature: 0.1 } })
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e?.error?.message || 'Gemini error ' + resp.status); }
      const data = await resp.json();
      result = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      break;
    }
    case 'ollama':
    default: {
      // Ollama: use regular callAI path — no meaningful overhead difference
      return callAI(system, user, () => {});
    }
  }
  diagAddLog('INFO', `Complexity check · ${provider} · ${Date.now() - t0}ms`);
  return result;
}

// ─── Core processing ──────────────────────────────────────────────
async function assessComplexity(code, srcLabel, tgtLabel) {
  const raw = await callAILite(
    SYS_REVIEW,
    `Assess how cleanly this ${srcLabel} script can be converted to ${tgtLabel}.\n\nRespond ONLY with this JSON object — no markdown, no backticks, no explanation:\n{"score":0-100,"level":"low"|"medium"|"high","label":"Clean"|"Moderate"|"Complex"|"Risky","issues":["..."],"manual_required":true|false}\n\nscore=0 is trivial, 100 is practically impossible. issues = specific blockers only (max 4, empty array if none).\n\nScript:\n${code}`
  );
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { return { score: 40, level: 'medium', label: 'Unknown', issues: ['Could not assess complexity automatically.'], manual_required: false }; }
}

async function processOne(code, srcLabel, tgt, tgtLabel, baseName, numCtx) {
  const src = document.getElementById('src-lang').value;
  const ext = TGT_EXT[tgt];
  const testExt = { python3: 'py', go: '_test.go' }[tgt] || 'sh';
  const langHints = LANG_HINTS[src] || {};
  lastConversionContext = { code, srcLabel, tgt, tgtLabel, langHints };
  let complexity = { score: 0, level: 'low', label: 'Clean', issues: [], manual_required: false };

  const estTokens = Math.ceil(code.length / 4);
  const maxTok = parseInt(document.getElementById('max-tokens').value);
  const headroom = maxTok - estTokens;
  diagSet('tokens', headroom < 200 ? 'red' : headroom < 600 ? 'amber' : 'green',
    headroom < 0 ? 'exceeds limit' : headroom < 600 ? `~${headroom} tok left` : `~${estTokens} tok input`);
  diagSet('model', 'green', provider === 'ollama'
    ? document.getElementById('ollama-model').value
    : (document.getElementById(provider + '-model')?.value || provider));
  const annotationModeOn = document.getElementById('annotation-mode').value === 'true';
  diagAddLog('INFO', `Run started · ${srcLabel} → ${tgtLabel} · ~${estTokens} est. tokens${annotationModeOn ? ' · annotation mode ON' : ''}`);

  const skipAssess = document.getElementById('skip-complexity').value === 'true';
  if (!skipAssess) {
    showStatus('Analyzing complexity…', true);
    complexity = await assessComplexity(code, srcLabel, tgtLabel);
    showComplexity(complexity.score, `${complexity.label} (${complexity.score}/100)`, complexity.level);
    showWarning(complexity.level, complexity.issues);
  } else {
    document.getElementById('complexity-wrap').style.display = 'none';
    document.getElementById('warn-banner').className = 'warn-banner';
  }

  // ── Step 1: Documentation ────────────────────────────────────────
  switchTab('docs'); setDot('docs', 'dot-run');
  showStatus('Generating documentation…', true);
  const docs = await callAI(SYS_DOC,
    `Analyze this ${srcLabel} script and write complete developer documentation.\n\n1. PURPOSE — what it does\n2. INPUTS — args, env vars, files read\n3. OUTPUTS — what it produces or modifies\n4. LOGIC WALKTHROUGH — key steps in order\n5. KNOWN RISKS — fragility, assumptions, hardcoded values\n6. MIGRATION NOTES — specific challenges converting to ${tgtLabel}${complexity.issues.length ? '\n\nKnown migration blockers:\n' + complexity.issues.join('\n') : ''}\n\nScript:\n${code}`,
    t => setOutput('docs', t, true));
  setDot('docs', complexity.level === 'high' ? 'dot-warn' : 'dot-done');
  if (baseName) await saveFile(baseName, '_docs.txt', docs);

  // ── Step 2: Test script ──────────────────────────────────────────
  switchTab('tests'); setDot('tests', 'dot-run');
  showStatus('Generating test script…', true);
  const testLang = ['python3', 'go'].includes(tgt) ? tgt : 'bash';
  const testPrompt =
    `Write a ${testLang === 'python3' ? 'pytest' : testLang === 'go' ? 'Go test' : 'bash'} test script that verifies a ${tgtLabel} conversion of this ${srcLabel} script preserves all original functionality.\n` +
    (langHints.test ? `\nLanguage-specific test guidance:\n${langHints.test}\n` : '') +
    `\nRequirements:\n- Test every distinct behavior and edge case\n- Use clear, descriptive test names\n- Include setup and teardown where needed\n- Write the complete script — do not truncate\n\nOutput ONLY raw code, no fences, no preamble.\n\nOriginal script:\n${code}`;
  const tests = await callAI(SYS_TEST, testPrompt, t => setOutput('tests', t, false));
  setDot('tests', 'dot-done');
  if (baseName) await saveFile(baseName, '_test.' + testExt, tests);

  // ── Step 2.1: Test coverage report ──────────────────────────────
  let coverage = [];
  try {
    showStatus('Assessing test coverage…', true);
    coverage = await assessTestCoverage(code, tests, srcLabel);
    showCoverage(coverage);
    const coveredCount = coverage.filter(b => b.covered).length;
    diagAddLog('INFO', `Test coverage: ${coveredCount}/${coverage.length} behaviors covered`);
  } catch (e) {
    diagAddLog('WARN', 'Coverage assessment failed: ' + e.message);
  }

  // ── Step 2.5: Variable extraction ───────────────────────────────
  switchTab('converted'); setDot('converted', 'dot-run');
  showStatus('Extracting variables…', true);
  let extractedVars = [];
  try {
    extractedVars = await extractVariables(code, srcLabel);
    showVariables(extractedVars);
    diagAddLog('INFO', `Variable extraction: ${extractedVars.length} variable(s) identified`);
  } catch (e) {
    diagAddLog('WARN', 'Variable extraction failed: ' + e.message);
  }
  const varHint = extractedVars.length
    ? `\nProposed variable names for hardcoded values (use these in vars: or as named constants):\n` +
      extractedVars.map(v => `  ${JSON.stringify(v.value)} → ${v.name} (${v.type})`).join('\n') + '\n'
    : '';

  // ── Step 3: Conversion ───────────────────────────────────────────
  showStatus('Converting to ' + tgtLabel + '…', true);
  const annotate = document.getElementById('annotation-mode').value === 'true';
  const annotationNote = annotate
    ? '\nANNOTATION MODE: After each converted task, module call, or logical block add a single inline comment in the format: # [From: <source construct> — <reason this mapping was chosen>]. Skip trivial one-liners that are self-evident. Explain non-obvious decisions and module choices.\n'
    : '';
  const manualNote = complexity.manual_required
    ? '\nIMPORTANT: Insert a # TODO: MANUAL REVIEW comment with a specific reason at every location requiring human intervention.'
    : '';
  const convertPrompt =
    `Convert this ${srcLabel} script to ${tgtLabel}. Output ONLY the converted code — no backtick fences, no preamble, no explanation. Write the complete output, never truncate.\n` +
    (tgt === 'ansible'
      ? `\nAnsible rules:\n- Use official Ansible modules, not shell/command, wherever a module exists\n- Every task must have a descriptive name:\n- Use vars: for all hardcoded values\n- Prefer idempotent parameters (state:, creates:, removes:) over imperative calls\n- Add hosts:, gather_facts:, and become: at the top appropriate for the target OS\n- Use block: / rescue: / always: for error handling\n`
      : '') +
    (tgt === 'python3' ? '\n- Use argparse for CLI args\n- Use subprocess.run() for shell commands\n' : '') +
    (langHints.convert ? `\n${langHints.convert}\n` : '') +
    varHint +
    annotationNote +
    manualNote +
    `\n\nOriginal ${srcLabel} script:\n${code}`;

  const converted = await callAI(SYS_CONVERT, convertPrompt, t => setOutput('converted', t, false), numCtx);

  // ── Truncation detection ─────────────────────────────────────────
  const looksIncomplete = (text) => {
    const t = text.trimEnd();
    return t.endsWith(':') || t.endsWith(',') || t.endsWith('(') ||
           t.endsWith('{') || t.endsWith('[') || t.endsWith('\\') ||
           t.endsWith('|') || t.endsWith('&&') || t.endsWith('name');
  };
  let wasTruncated = false;
  if (converted && looksIncomplete(converted)) {
    wasTruncated = true;
    const warning = '\n\n# ⚠️  WARNING: Output appears truncated. Increase max tokens in Settings and re-run.';
    setOutput('converted', converted + warning, false);
    diagAddLog('WARN', 'Conversion output may be truncated — increase max tokens');
  }

  setDot('converted', (complexity.manual_required || wasTruncated) ? 'dot-warn' : 'dot-done');
  if (baseName) await saveFile(baseName, '.' + ext, converted);

  // ── Step 4: Idempotency scoring (Ansible only) ───────────────────
  let idempotency = null;
  let confidence = [];
  if (tgt === 'ansible' && converted && !wasTruncated) {
    showStatus('Scoring idempotency…', true);
    try {
      idempotency = await assessIdempotency(converted);
      showIdempotency(idempotency.score, idempotency.label, idempotency.level, idempotency.flags);
      diagAddLog(idempotency.score >= 80 ? 'OK' : 'WARN', `Idempotency: ${idempotency.label} (${idempotency.score}/100)`);
    } catch (e) {
      diagAddLog('ERR', 'Idempotency check failed: ' + e.message);
    }

    // ── Step 4.1: Confidence scoring per task ─────────────────────
    showStatus('Scoring task confidence…', true);
    try {
      confidence = await assessConfidence(converted);
      showConfidence(confidence);
      const low = confidence.filter(t => t.confidence === 'low').length;
      diagAddLog(low > 0 ? 'WARN' : 'OK', `Confidence: ${confidence.length} tasks scored · ${low} need review`);
    } catch (e) {
      diagAddLog('WARN', 'Confidence scoring failed: ' + e.message);
    }

    // ── Step 4.2: Show validate panel ─────────────────────────────
    showValidatePanel(converted);
    diagAddLog('INFO', launchPyAvailable
      ? 'ansible-lint validation ready — click Run ansible-lint in the panel'
      : 'ansible-lint validation ready — download playbook.yml and run locally');
  }

  return { docs, tests, converted, complexity, idempotency, confidence, coverage };
}

// ─── PowerShell pre-flight scanner ───────────────────────────────
// Runs before processOne on any PowerShell source. Scans for WMI/CIM
// calls and credential patterns, returns structured findings so the
// UI can surface them before the model ever runs.
function scanPowerShell(code) {
  const findings = [];

  // ── WMI / CIM detection ──
  const wmiMatches = [...code.matchAll(/Get-WmiObject\s+[^\n]*/gi)];
  const cimMatches = [...code.matchAll(/Get-CimInstance\s+[^\n]*/gi)];
  if (wmiMatches.length > 0) {
    const classes = wmiMatches.map(m => {
      const cls = m[0].match(/-Class\s+(\S+)|Win32_\w+|CIM_\w+/i);
      return cls ? cls[0].replace(/-Class\s+/i, '') : 'unknown class';
    }).filter((v, i, a) => a.indexOf(v) === i); // dedupe
    findings.push({
      level: 'high',
      type: 'wmi',
      msg: `WMI detected (${wmiMatches.length} call${wmiMatches.length > 1 ? 's' : ''}): ${classes.join(', ')} — no direct Ansible module equivalent. Each will be flagged TODO: MANUAL REVIEW in the output.`
    });
  }
  if (cimMatches.length > 0) {
    const classes = cimMatches.map(m => {
      const cls = m[0].match(/-ClassName\s+(\S+)|CIM_\w+|Win32_\w+/i);
      return cls ? cls[0].replace(/-ClassName\s+/i, '') : 'unknown class';
    }).filter((v, i, a) => a.indexOf(v) === i);
    findings.push({
      level: 'high',
      type: 'cim',
      msg: `CIM detected (${cimMatches.length} call${cimMatches.length > 1 ? 's' : ''}): ${classes.join(', ')} — no direct Ansible module equivalent. Each will be flagged TODO: MANUAL REVIEW in the output.`
    });
  }

  // ── Credential / secret detection ──
  const credPatterns = [
    { re: /Get-Credential/gi,                       label: 'Get-Credential' },
    { re: /\[PSCredential\]/gi,                     label: 'PSCredential type' },
    { re: /New-Object\s+PSCredential/gi,            label: 'New-Object PSCredential' },
    { re: /ConvertTo-SecureString\s+-AsPlainText/gi,label: 'ConvertTo-SecureString -AsPlainText (plaintext secret)' },
    { re: /ConvertFrom-SecureString/gi,             label: 'ConvertFrom-SecureString' },
  ];
  const credHits = credPatterns.filter(p => p.re.test(code)).map(p => p.label);

  // Also catch suspicious variable names assigned to string literals
  const secretVarMatches = [...code.matchAll(/\$(password|passwd|secret|apikey|api_key|token|credential)\s*=\s*["'][^"']+["']/gi)];
  if (secretVarMatches.length > 0) {
    credHits.push(`plaintext secret variable${secretVarMatches.length > 1 ? 's' : ''} (${secretVarMatches.map(m => '$' + m[1]).join(', ')})`);
  }

  if (credHits.length > 0) {
    findings.push({
      level: 'high',
      type: 'credentials',
      msg: `Credential patterns detected: ${credHits.join('; ')} — these will be replaced with Ansible Vault references and TODO comments. Review the converted output before committing.`
    });
  }

  return findings;
}

// Renders pre-flight findings into the warn banner BEFORE generation starts.
// Does not block — it informs the user while the run proceeds.
function showPreflightWarnings(findings) {
  if (!findings.length) return;
  const el = document.getElementById('warn-banner');
  el.className = 'warn-banner show warn-red';
  const title = '&#9888; Pre-flight scan — issues detected in source script';
  el.innerHTML = `<strong>${title}</strong>${findings.map(f => `&bull; ${f.msg}`).join('<br>')}`;
}

// ─── Variable extraction ──────────────────────────────────────────
async function extractVariables(code, srcLabel) {
  const raw = await callAILite(
    SYS_REVIEW,
    `Identify hardcoded values in this ${srcLabel} script that should become variables in the modernized output.\n\nRespond ONLY with JSON — no markdown, no backticks:\n{"variables":[{"value":"exact hardcoded value","name":"proposed_var_name","type":"path|port|hostname|service|credential|url|timeout|other"}]}\n\nMax 8 variables. Only include values worth parameterizing — skip trivial literals like loop counters or boolean flags. Empty array if none.\n\nScript:\n${code}`
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed.variables) ? parsed.variables : [];
  } catch { return []; }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showVariables(vars) {
  const wrap = document.getElementById('vars-wrap');
  if (!vars || !vars.length) { wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  document.getElementById('vars-count').textContent = vars.length + ' found';
  document.getElementById('vars-table').innerHTML = vars.map(v =>
    `<tr><td class="vt-val">${escHtml(v.value)}</td><td class="vt-arr">→</td>` +
    `<td class="vt-name">${escHtml(v.name)}<span class="vt-type">${escHtml(v.type)}</span></td></tr>`
  ).join('');
}

function resetVariables() {
  document.getElementById('vars-wrap').classList.remove('show');
  document.getElementById('vars-table').innerHTML = '';
  document.getElementById('vars-count').textContent = '';
}

// ─── Idempotency scoring ──────────────────────────────────────────
async function assessIdempotency(convertedCode) {
  const raw = await callAILite(
    SYS_REVIEW,
    `Assess the idempotency of this Ansible playbook. Score how safely it can be run multiple times without unintended side effects.\n\nRespond ONLY with this JSON — no markdown, no backticks:\n{"score":0-100,"level":"idempotent"|"mostly"|"partial"|"imperative","label":"Fully Idempotent"|"Mostly Idempotent"|"Partial"|"Imperative","flags":["task name or description: reason it is not idempotent"]}\n\nscore=100 means every task is fully idempotent. score=0 means fully imperative (always causes change). flags = specific tasks that are not idempotent (max 5, empty array if none).\n\nPlaybook:\n${convertedCode}`
  );
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { return { score: 50, level: 'partial', label: 'Unknown', flags: ['Could not assess idempotency automatically.'] }; }
}

function showIdempotency(score, label, level, flags) {
  const wrap = document.getElementById('idempotency-wrap');
  wrap.classList.add('show');
  document.getElementById('ib-score-label').textContent = `${label} (${score}/100)`;
  const fill = document.getElementById('ib-fill');
  fill.style.width = score + '%';
  fill.className = 'cb-fill ' + (score >= 80 ? 'fill-green' : score >= 50 ? 'fill-amber' : 'fill-red');
  const flagsEl = document.getElementById('ib-flags');
  flagsEl.innerHTML = (flags && flags.length)
    ? flags.map(f => `<div class="ib-flag">&#9888; ${f}</div>`).join('')
    : '';
}

function resetIdempotency() {
  document.getElementById('idempotency-wrap').classList.remove('show');
  document.getElementById('ib-flags').innerHTML = '';
}

// ─── Confidence scoring ───────────────────────────────────────────
async function assessConfidence(convertedCode) {
  const raw = await callAILite(
    SYS_REVIEW,
    `Score the conversion confidence for each task in this Ansible playbook. For each task assess how directly it maps from the original source — how much manual verification is needed.\n\nRespond ONLY with this JSON — no markdown, no backticks:\n{"tasks":[{"name":"task name","confidence":"high"|"medium"|"low","reason":"one sentence"}]}\n\nhigh = direct module mapping, no ambiguity. medium = reasonable but may need adjustment. low = manual review required, no clean module, or behavior unclear.\n\nMax 12 tasks. If the playbook has more, score the most significant ones.\n\nPlaybook:\n${convertedCode}`
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch { return []; }
}

function showConfidence(tasks) {
  const wrap = document.getElementById('confidence-wrap');
  if (!tasks || !tasks.length) { wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  const low = tasks.filter(t => t.confidence === 'low').length;
  document.getElementById('confidence-count').textContent =
    `${tasks.length} task${tasks.length !== 1 ? 's' : ''} · ${low} need${low !== 1 ? '' : 's'} review`;
  document.getElementById('confidence-table').innerHTML = tasks.map(t => {
    const cls = t.confidence === 'high' ? 'conf-green' : t.confidence === 'medium' ? 'conf-amber' : 'conf-red';
    const label = t.confidence === 'high' ? 'High' : t.confidence === 'medium' ? 'Medium' : 'Low';
    return `<tr><td class="conf-task">${escHtml(t.name)}</td>` +
      `<td style="white-space:nowrap;padding:6px 8px;"><span class="conf-badge ${cls}">${label}</span></td>` +
      `<td class="conf-reason">${escHtml(t.reason)}</td></tr>`;
  }).join('');
}

function resetConfidence() {
  document.getElementById('confidence-wrap').classList.remove('show');
  document.getElementById('confidence-table').innerHTML = '';
  document.getElementById('confidence-count').textContent = '';
}

// ─── Test coverage report ─────────────────────────────────────────
async function assessTestCoverage(code, tests, srcLabel) {
  const raw = await callAILite(
    SYS_REVIEW,
    `Compare this ${srcLabel} script against the generated test script. For each distinct behavior in the original, determine whether the tests cover it.\n\nRespond ONLY with this JSON — no markdown, no backticks:\n{"behaviors":[{"description":"one sentence behavior","covered":true|false,"test_name":"name of covering test or null"}]}\n\nMax 10 behaviors. Focus on observable behaviors: file operations, service calls, network activity, output produced, and error handling.\n\nOriginal script:\n${code}\n\nGenerated tests:\n${tests}`
  );
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed.behaviors) ? parsed.behaviors : [];
  } catch { return []; }
}

function showCoverage(behaviors) {
  const wrap = document.getElementById('coverage-wrap');
  if (!behaviors || !behaviors.length) { wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  const covered = behaviors.filter(b => b.covered).length;
  document.getElementById('coverage-summary').textContent =
    `${covered}/${behaviors.length} behaviors covered`;
  document.getElementById('coverage-list').innerHTML = behaviors.map(b => {
    const cls = b.covered ? 'covered' : 'uncovered';
    const icon = b.covered ? '✓' : '✗';
    return `<div class="cov-item">` +
      `<div class="cov-check ${cls}">${icon}</div>` +
      `<div><div class="cov-desc">${escHtml(b.description)}</div>` +
      (b.covered && b.test_name ? `<div class="cov-test">${escHtml(b.test_name)}</div>` : '') +
      `</div></div>`;
  }).join('');
}

function resetCoverage() {
  document.getElementById('coverage-wrap').classList.remove('show');
  document.getElementById('coverage-list').innerHTML = '';
  document.getElementById('coverage-summary').textContent = '';
}

// ─── Ansible-lint validation ──────────────────────────────────────
async function probeLaunchPy() {
  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (data.service === 'rosetta-stone') {
        launchPyAvailable = true;
        diagAddLog('OK', 'launch.py detected — ansible-lint validation available');
      }
    }
  } catch { /* not running, stay in copy-paste mode */ }
}

function showValidatePanel(convertedCode) {
  const wrap = document.getElementById('validate-wrap');
  wrap.classList.add('show');

  const badge = document.getElementById('vl-server-badge');
  const runBtn = document.getElementById('vl-run-btn');
  const cmdSection = document.getElementById('vl-cmd-section');
  const pasteSection = document.getElementById('vl-paste-section');

  if (launchPyAvailable) {
    badge.textContent = 'live server';
    badge.className = 'vl-server-badge live';
    runBtn.style.display = '';
    cmdSection.style.display = 'none';
    pasteSection.style.display = 'none';
  } else {
    badge.textContent = 'copy-paste mode';
    badge.className = 'vl-server-badge local';
    runBtn.style.display = 'none';
    cmdSection.style.display = '';
    pasteSection.style.display = '';
  }
  document.getElementById('vl-results-area').innerHTML = '';
}

function resetValidate() {
  document.getElementById('validate-wrap').classList.remove('show');
  document.getElementById('vl-results-area').innerHTML = '';
  if (document.getElementById('vl-paste-input')) {
    document.getElementById('vl-paste-input').value = '';
  }
}

function downloadPlaybook() {
  const code = document.getElementById('out-converted').textContent;
  if (!code || code === 'Converted code will appear here after generation.') {
    alert('Run a conversion first.'); return;
  }
  const blob = new Blob([code], { type: 'text/yaml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'playbook.yml';
  a.click();
  URL.revokeObjectURL(a.href);
  diagAddLog('INFO', 'Downloaded playbook.yml for local ansible-lint validation');
}

async function runValidate() {
  if (!launchPyAvailable) return;
  const code = document.getElementById('out-converted').textContent;
  if (!code) { alert('No converted code to validate.'); return; }

  const btn = document.getElementById('vl-run-btn');
  const results = document.getElementById('vl-results-area');
  btn.disabled = true;
  btn.textContent = '⏳ Running…';
  results.innerHTML = '';

  try {
    const res = await fetch('/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playbook: code })
    });
    const data = await res.json();
    renderLintResults(data);
    diagAddLog(data.passed ? 'OK' : 'WARN',
      `ansible-lint: ${data.passed ? 'passed' : `${data.error_count} error(s), ${data.warning_count} warning(s)`}`);
  } catch (e) {
    results.innerHTML = `<div class="vl-violation vl-error"><span class="vl-sev">Error</span><span>${escHtml(e.message)}</span></div>`;
    diagAddLog('ERR', 'ansible-lint request failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run ansible-lint';
  }
}

function parseRawLintOutput() {
  const raw = document.getElementById('vl-paste-input').value.trim();
  if (!raw) { alert('Paste some ansible-lint output first.'); return; }

  // Try JSON first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const violations = parsed.map(v => ({
        rule:     v.check_name || v.rule?.id || 'unknown',
        message:  v.description || v.message || '',
        severity: normaliseSev(v.severity),
        line:     v.location?.lines?.begin || null,
      }));
      renderLintResults({
        available: true,
        passed: violations.length === 0,
        violations,
        error_count:   violations.filter(v => v.severity === 'error').length,
        warning_count: violations.filter(v => v.severity === 'warning').length,
        raw
      });
      return;
    }
  } catch { /* not JSON, parse as plain text */ }

  // Plain text: "file.yml:line:col: severity[rule] message"
  const lines = raw.split('\n');
  const violations = [];
  for (const line of lines) {
    const m = line.match(/^.+?:(\d+):\d+:\s*(error|warning|info)\[([^\]]+)\]\s+(.+)$/i);
    if (m) {
      violations.push({ line: parseInt(m[1]), severity: normaliseSev(m[2]), rule: m[3], message: m[4].trim() });
    }
  }
  renderLintResults({
    available: true,
    passed: violations.length === 0,
    violations,
    error_count:   violations.filter(v => v.severity === 'error').length,
    warning_count: violations.filter(v => v.severity === 'warning').length,
    raw
  });
}

function normaliseSev(raw) {
  raw = (raw || '').toLowerCase();
  if (['error','critical','blocker','major'].includes(raw)) return 'error';
  if (['info','minor'].includes(raw)) return 'info';
  return 'warning';
}

function renderLintResults(data) {
  const el = document.getElementById('vl-results-area');

  if (!data.available) {
    el.innerHTML = `<div class="vl-violation vl-warning">
      <span class="vl-sev">Not found</span>
      <div><div>${escHtml(data.error || 'ansible-lint not available')}</div>
      <div class="vl-rule">Install: pip install ansible-lint ansible-core</div></div>
    </div>`;
    return;
  }

  if (data.passed || data.violations.length === 0) {
    el.innerHTML = `<div class="vl-passed-banner">&#10003; ansible-lint passed — no violations found${data.lint_version ? ' · ' + escHtml(data.lint_version) : ''}</div>`;
    return;
  }

  const rows = data.violations.map(v => `
    <div class="vl-violation vl-${escHtml(v.severity)}">
      <span class="vl-sev">${escHtml(v.severity)}</span>
      <div style="flex:1;min-width:0;">
        <div>${escHtml(v.message)}</div>
        <div class="vl-rule">${escHtml(v.rule)}</div>
      </div>
      ${v.line ? `<span class="vl-line">line ${v.line}</span>` : ''}
    </div>`).join('');

  const summary = `${data.error_count} error${data.error_count !== 1 ? 's' : ''}, ${data.warning_count} warning${data.warning_count !== 1 ? 's' : ''}`;

  el.innerHTML = `<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">${summary}</div>
    <div class="vl-results">${rows}</div>
    ${data.raw ? `<details style="margin-top:8px;"><summary style="font-size:11px;color:var(--text3);cursor:pointer;">Raw output</summary><div class="vl-raw" style="margin-top:4px;">${escHtml(data.raw)}</div></details>` : ''}`;
}

// ─── Iterative refinement ─────────────────────────────────────────
async function runFix() {
  const fixInput = document.getElementById('fix-input').value.trim();
  if (!fixInput) { alert('Describe the problem or paste an error first.'); return; }
  if (!lastConversionContext) { alert('Run a full conversion first.'); return; }

  const { code, srcLabel, tgt, tgtLabel, langHints } = lastConversionContext;
  const currentConverted = document.getElementById('out-converted').textContent;

  const btn = document.getElementById('fix-btn');
  const statusEl = document.getElementById('fix-status');
  btn.disabled = true;
  statusEl.innerHTML = '<div class="spinner"></div><span>Re-running conversion with fix context…</span>';
  setDot('converted', 'dot-run');

  const fixPrompt =
    `You previously converted a ${srcLabel} script to ${tgtLabel}. The conversion has a problem that needs fixing.\n\n` +
    `PROBLEM REPORTED:\n${fixInput}\n\n` +
    `CURRENT (BROKEN) CONVERSION:\n${currentConverted}\n\n` +
    `ORIGINAL ${srcLabel.toUpperCase()} SCRIPT:\n${code}\n\n` +
    (langHints.convert ? `Language-specific rules (still apply):\n${langHints.convert}\n\n` : '') +
    `Fix the conversion to resolve the reported problem. Output ONLY the corrected code — no backtick fences, no preamble, no explanation. Write the complete output, never truncate.`;

  try {
    await callAI(SYS_CONVERT, fixPrompt, t => setOutput('converted', t, false));
    setDot('converted', 'dot-done');
    statusEl.innerHTML = '<span style="color:var(--text-success);">&#10003; Fix applied — review the updated output above.</span>';
    diagAddLog('OK', 'Fix applied — re-ran conversion with error context');
  } catch (e) {
    setDot('converted', 'dot-warn');
    statusEl.innerHTML = '<span style="color:var(--text-danger);">Error: ' + e.message + '</span>';
    diagAddLog('ERR', 'Fix run failed: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ─── Conversion history ───────────────────────────────────────────
function toggleHistory() {
  document.getElementById('history-panel').classList.toggle('open');
}

function saveToHistory(entry) {
  historySeq++;
  const ts = new Date().toTimeString().slice(0, 8);
  const preview = (entry.code || '').trim().split('\n')[0].slice(0, 55);
  conversionHistory.unshift({ id: historySeq, ts, preview, ...entry });
  if (conversionHistory.length > 10) conversionHistory.pop();
  renderHistory();
  const btn = document.getElementById('history-btn');
  if (btn) btn.innerHTML = btn.innerHTML.replace(/\s*\(\d+\)/, '') + ` (${conversionHistory.length})`;
}

function renderHistory() {
  const el = document.getElementById('history-content');
  if (!conversionHistory.length) {
    el.innerHTML = '<div class="history-empty">No conversions yet this session.</div>';
    return;
  }
  const lvlClass = { low: 'risk-clean', medium: 'risk-partial', high: 'risk-manual' };
  el.innerHTML = '<div class="history-list">' + conversionHistory.map(h =>
    `<div class="history-item">
      <span class="history-ts">${h.ts}</span>
      <div class="history-meta">
        <div class="history-langs">${escHtml(h.srcLabel)} &rarr; ${escHtml(h.tgtLabel)}</div>
        <div class="history-preview">${escHtml(h.preview)}</div>
      </div>
      <span class="history-badge ${lvlClass[h.complexity?.level] || ''}">${h.complexity?.label || '—'}</span>
      <button class="btn btn-sm" onclick="restoreFromHistory(${h.id})">Restore</button>
    </div>`
  ).join('') + '</div>';
}

function restoreFromHistory(id) {
  const h = conversionHistory.find(e => e.id === id);
  if (!h) return;
  setOutput('docs', h.docs || '', true);
  setOutput('tests', h.tests || '', false);
  setOutput('converted', h.converted || '', false);
  if (h.complexity) {
    showComplexity(h.complexity.score, `${h.complexity.label} (${h.complexity.score}/100)`, h.complexity.level);
    showWarning(h.complexity.level, h.complexity.issues);
    document.getElementById('complexity-wrap').style.display = '';
  }
  document.getElementById('history-panel').classList.remove('open');
  switchTab('docs');
  showStatus(`Restored: ${h.srcLabel} → ${h.tgtLabel} (${h.ts})`, false);
  diagAddLog('INFO', `History restored: entry ${h.id} — ${h.srcLabel} → ${h.tgtLabel}`);
}

function clearHistory() {
  conversionHistory = [];
  historySeq = 0;
  renderHistory();
  const btn = document.getElementById('history-btn');
  if (btn) btn.innerHTML = btn.innerHTML.replace(/\s*\(\d+\)/, '');
}

// ─── Run ──────────────────────────────────────────────────────────
async function runAll() {
  const src = document.getElementById('src-lang').value;
  const srcLabel = document.getElementById('src-lang').options[document.getElementById('src-lang').selectedIndex].text;
  const tgt = document.getElementById('tgt-lang').value;
  const tgtLabel = TGT_LABELS[tgt];
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  ['docs', 'tests', 'converted'].forEach(t => { setOutput(t, '', false); setDot(t, ''); });
  document.getElementById('complexity-wrap').style.display = 'none';
  document.getElementById('warn-banner').className = 'warn-banner';
  document.getElementById('ctx-banner').className = 'ctx-banner';
  document.getElementById('summary-panel').classList.remove('show');
  resetIdempotency();
  resetConfidence();
  resetCoverage();
  resetValidate();
  resetVariables();
  resetDiffView();
  batchResults = [];
  savePrefs();

  try {
    if (mode === 'single') {
      const code = document.getElementById('code-input').value.trim();
      if (!code) { alert('Paste some legacy code first.'); btn.disabled = false; return; }

      // Pre-flight scan for PowerShell source
      if (src === 'powershell') {
        const findings = scanPowerShell(code);
        if (findings.length) {
          showPreflightWarnings(findings);
          findings.forEach(f => diagAddLog('WARN', `Pre-flight: ${f.msg.slice(0, 120)}`));
        }
      }

      const ctxCheck = await checkOllamaContext(code);
      if (!ctxCheck.ok) { showStatus('Blocked — switch to a cloud provider for this script.', false); btn.disabled = false; return; }
      const result = await processOne(code, srcLabel, tgt, tgtLabel, null, ctxCheck.numCtx);
      saveToHistory({ code, srcLabel, tgtLabel, ...result });
      showStatus(result.complexity.manual_required ? 'Done — manual review required (see warnings above).' : 'Done.', false);
      switchTab('docs');
    } else {
      if (!queue.length) { alert('No files in queue.'); btn.disabled = false; return; }
      const delay = parseInt(document.getElementById('batch-delay').value);
      for (let i = 0; i < queue.length; i++) {
        const f = queue[i];
        queue[i].status = 'running'; renderQueue();
        showStatus(`Processing ${i + 1} of ${queue.length}: ${f.name}`, true);
        ['docs', 'tests', 'converted'].forEach(t => { setOutput(t, '', false); setDot(t, ''); });
        document.getElementById('complexity-wrap').style.display = 'none';
        document.getElementById('warn-banner').className = 'warn-banner';

        // Pre-flight scan for PowerShell source
        if (src === 'powershell') {
          const findings = scanPowerShell(f.content);
          if (findings.length) {
            showPreflightWarnings(findings);
            findings.forEach(ff => diagAddLog('WARN', `Pre-flight [${f.name}]: ${ff.msg.slice(0, 100)}`));
          }
        }
        const ctxCheck = await checkOllamaContext(f.content);
        if (!ctxCheck.ok) { queue[i].status = 'error'; batchResults.push({ name: f.name, complexity: { score: 0, level: 'high', label: 'Too large', issues: ['Script too large for Ollama — switch to a cloud provider'], manual_required: true } }); renderQueue(); continue; }
        try {
          const base = f.name.replace(/\.[^.]+$/, '');
          const result = await processOne(f.content, srcLabel, tgt, tgtLabel, base, ctxCheck.numCtx);
          queue[i].status = result.complexity.level === 'high' ? 'warn' : 'done';
          saveToHistory({ code: f.content, srcLabel, tgtLabel, ...result });
          batchResults.push({ name: f.name, ...result });
        } catch (e) { queue[i].status = 'error'; batchResults.push({ name: f.name, complexity: { score: 0, level: 'high', label: 'Error', issues: [e.message], manual_required: true } }); }
        renderQueue();
        if (delay && i < queue.length - 1) await new Promise(r => setTimeout(r, delay));
      }
      showStatus('Batch complete.', false);
      switchTab('docs');
      renderSummary(batchResults);
    }
  } catch (e) {
    showStatus('Error: ' + e.message, false);
  } finally {
    btn.disabled = false;
    diagRunAutoDetect();
  }
}

// ─── Summary ──────────────────────────────────────────────────────
function renderSummary(results) {
  document.getElementById('summary-panel').classList.add('show');
  const total = results.length;
  const clean = results.filter(r => r.complexity?.level === 'low').length;
  const partial = results.filter(r => r.complexity?.level === 'medium').length;
  const manual = results.filter(r => r.complexity?.level === 'high').length;
  document.getElementById('stat-grid').innerHTML =
    `<div class="stat-card"><div class="stat-val">${total}</div><div class="stat-lbl">Files processed</div></div>` +
    `<div class="stat-card"><div class="stat-val" style="color:#1D9E75;">${clean}</div><div class="stat-lbl">Clean</div></div>` +
    `<div class="stat-card"><div class="stat-val" style="color:#BA7517;">${partial}</div><div class="stat-lbl">Needs review</div></div>` +
    `<div class="stat-card"><div class="stat-val" style="color:#E24B4A;">${manual}</div><div class="stat-lbl">Manual required</div></div>`;
  const tbody = document.getElementById('summary-tbody'); tbody.innerHTML = '';
  results.forEach(r => {
    const c = r.complexity || {};
    const pillClass = { low: 'risk-clean', medium: 'risk-partial', high: 'risk-manual' }[c.level] || 'risk-manual';
    const pillText = { low: 'Clean', medium: 'Partial', high: 'Manual' }[c.level] || 'Error';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><code style="font-family:var(--mono);font-size:12px;">${r.name}</code></td>` +
      `<td><span class="risk-pill ${pillClass}">${pillText}</span><div class="note-cell" style="margin-top:3px;">${c.score || 0}/100</div></td>` +
      `<td>${c.manual_required ? 'Partial + TODOs' : 'Automated'}</td>` +
      `<td class="note-cell">${(c.issues?.length) ? c.issues.join('; ') : '—'}</td>`;
    tbody.appendChild(tr);
  });
}

function exportSummaryCSV() {
  const rows = [['File', 'Level', 'Score', 'Conversion', 'Issues']];
  batchResults.forEach(r => { const c = r.complexity || {}; rows.push([r.name, c.level || '', c.score || 0, c.manual_required ? 'Partial+TODOs' : 'Automated', (c.issues || []).join(' | ')]); });
  downloadText(rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'rosetta_summary.csv');
}

// ─── Diagnostics ──────────────────────────────────────────────────
const DIAG_SIGNALS = [
  { id: 'api',      name: 'API / server reachable' },
  { id: 'auth',     name: 'Auth / key accepted' },
  { id: 'model',    name: 'Model confirmed' },
  { id: 'speed',    name: 'Response time' },
  { id: 'stream',   name: 'Stream health' },
  { id: 'tokens',   name: 'Token headroom' },
  { id: 'complete', name: 'Last response complete' },
  { id: 'output',   name: 'Output validity' },
  { id: 'errors',   name: 'Error count' },
  { id: 'rate',     name: 'Rate limit' },
];

let diagState = {};
let diagLog = [];
let diagSessionStats = { requests: 0, errors: 0, totalMs: 0, lastMs: 0 };
let diagFirstRun = false;

DIAG_SIGNALS.forEach(s => { diagState[s.id] = { color: 'grey', val: '—' }; });

function toggleDiag() {
  const panel = document.getElementById('diag-panel');
  const isOpen = panel.classList.toggle('open');
  if (isOpen) { diagRunAutoDetect(); diagRefreshBoard(); }
}

function switchDTab(id) {
  ['health', 'detect', 'log'].forEach(t => {
    document.getElementById('dtab-' + t).classList.toggle('active', t === id);
    document.getElementById('dpanel-' + t).classList.toggle('active', t === id);
  });
}

function diagSet(id, color, val) {
  diagState[id] = { color, val };
  if (diagFirstRun) diagRefreshBoard();
}

function diagRefreshBoard() {
  if (!diagFirstRun) return;
  document.getElementById('diag-placeholder').classList.add('hidden');
  document.getElementById('diag-board').classList.remove('hidden');
  const colors = Object.values(diagState).map(s => s.color);
  const hasRed = colors.includes('red');
  const hasAmber = colors.includes('amber');
  const banner = document.getElementById('hb-banner');
  banner.className = 'health-banner ' + (hasRed ? 'hb-error' : hasAmber ? 'hb-warn' : 'hb-ok');
  document.getElementById('hb-msg').textContent = hasRed ? 'Issue detected — check red signals below' : hasAmber ? 'Warning — review amber signals below' : 'All signals green';
  const avg = diagSessionStats.requests > 0 ? (diagSessionStats.totalMs / diagSessionStats.requests / 1000).toFixed(1) : '—';
  document.getElementById('hb-detail').textContent = `${diagSessionStats.requests} request${diagSessionStats.requests !== 1 ? 's' : ''} · ${diagSessionStats.errors} error${diagSessionStats.errors !== 1 ? 's' : ''} · avg ${avg}s`;
  const board = document.getElementById('signal-board');
  board.innerHTML = '';
  DIAG_SIGNALS.forEach(sig => {
    const s = diagState[sig.id] || { color: 'grey', val: '—' };
    const row = document.createElement('div');
    row.className = `sig-row state-${s.color}`;
    row.innerHTML = `<div class="sdot ${s.color}"></div><span class="sig-name">${sig.name}</span><span class="sig-val ${s.color === 'green' ? '' : s.color}">${s.val}</span>`;
    board.appendChild(row);
  });
}

function diagAddLog(level, msg, durationMs) {
  const ts = new Date().toTimeString().slice(0, 8);
  diagLog.push({ ts, level, msg, dur: durationMs || null });
  const wrap = document.getElementById('diag-log-wrap');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'dlog-row';
  const lvlCls = level === 'OK' ? 'll-ok' : level === 'ERR' ? 'll-err' : level === 'WARN' ? 'll-warn' : 'll-info';
  row.innerHTML = `<div class="dlog-ts">${ts}</div><div class="dlog-lv ${lvlCls}">${level}</div><div class="dlog-msg">${msg}</div><div class="dlog-dur">${durationMs ? durationMs + 'ms' : '—'}</div>`;
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
  document.getElementById('diag-log-count').textContent = diagLog.length;
}

function diagExportLog() {
  const lines = diagLog.map(e => `[${e.ts}] [${e.level}] ${e.msg}${e.dur ? ' (' + e.dur + 'ms)' : ''}`);
  downloadText(lines.join('\n'), 'rosetta-diag-log.txt');
}

async function diagRecheck() {
  diagAddLog('INFO', 'Manual re-check triggered');
  await diagRunAutoDetect();
}

async function diagRunAutoDetect() {
  const setPill = (id, text, active) => {
    const el = document.getElementById('dc-pill-' + id);
    if (!el) return;
    el.textContent = text;
    el.style.background = active ? 'var(--bg-success)' : 'var(--bg3)';
    el.style.color = active ? 'var(--text-success)' : 'var(--text3)';
  };
  const setCard = (id) => {
    document.getElementById('dc-' + id).className = 'detect-card' + (provider === id ? ' dc-active' : '');
    setPill(id, provider === id ? 'active' : 'not active', provider === id);
  };
  ['anthropic', 'ollama', 'openai', 'gemini'].forEach(setCard);

  // ── Anthropic ──
  const antKey = document.getElementById('anthropic-key').value.trim();
  const antModel = document.getElementById('anthropic-model').value;
  const hasAntKey = antKey.length > 10;
  const fmtOk = antKey.startsWith('sk-ant-');
  document.getElementById('dcv-ant-key').textContent = hasAntKey ? 'sk-ant-…' + antKey.slice(-4) : 'none';
  document.getElementById('dcv-ant-key').className = 'dc-val ' + (hasAntKey ? 'ok' : '');
  document.getElementById('dcv-ant-fmt').textContent = hasAntKey ? (fmtOk ? 'valid ✓' : 'unexpected format') : '—';
  document.getElementById('dcv-ant-fmt').className = 'dc-val ' + (fmtOk && hasAntKey ? 'ok' : hasAntKey ? 'warn' : '');
  document.getElementById('dcv-ant-model').textContent = antModel;
  if (provider === 'anthropic' && hasAntKey) {
    document.getElementById('dcd-ant-conn').className = 'sdot checking';
    document.getElementById('dcv-ant-conn').textContent = 'checking…';
    try {
      const t0 = Date.now();
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: antModel, max_tokens: 5, stream: false, messages: [{ role: 'user', content: 'hi' }] }) });
      const ms = Date.now() - t0;
      document.getElementById('dcd-ant-conn').className = 'sdot ' + (r.ok ? 'green' : 'red');
      document.getElementById('dcv-ant-conn').textContent = r.ok ? `${r.status} OK (${ms}ms)` : `${r.status} error`;
      document.getElementById('dcv-ant-conn').className = 'dc-val ' + (r.ok ? 'ok' : 'bad');
    } catch (e) {
      document.getElementById('dcd-ant-conn').className = 'sdot red';
      document.getElementById('dcv-ant-conn').textContent = 'unreachable';
      document.getElementById('dcv-ant-conn').className = 'dc-val bad';
    }
  } else {
    document.getElementById('dcd-ant-conn').className = 'sdot grey';
    document.getElementById('dcv-ant-conn').textContent = provider === 'anthropic' ? 'no key' : 'not active';
    document.getElementById('dcv-ant-conn').className = 'dc-val';
  }

  // ── Ollama ──
  const olUrl = document.getElementById('ollama-url').value.trim().replace(/\/$/, '');
  const olModel = document.getElementById('ollama-model').value.trim();
  document.getElementById('dcv-ol-url').textContent = olUrl.replace('http://', '').replace('https://', '');
  document.getElementById('dcd-ol-srv').className = 'sdot checking';
  document.getElementById('dcv-ol-srv').textContent = 'checking…';
  try {
    const tags = await fetch(olUrl + '/api/tags').then(r => r.json());
    const models = (tags?.models || []).map(m => m.name);
    const modelNames = models.map(m => m.split(':')[0]);
    const modelFound = models.some(m => m === olModel || m.startsWith(olModel.split(':')[0]));
    document.getElementById('dcd-ol-srv').className = 'sdot green';
    document.getElementById('dcv-ol-srv').textContent = 'running ✓';
    document.getElementById('dcv-ol-srv').className = 'dc-val ok';
    document.getElementById('dcv-ol-list').textContent = modelNames.length ? modelNames.slice(0, 3).join(', ') + (modelNames.length > 3 ? '…' : '') : 'none pulled';
    document.getElementById('dcd-ol-model').className = 'sdot ' + (modelFound ? 'green' : 'red');
    document.getElementById('dcv-ol-model').textContent = modelFound ? olModel + ' ✓' : olModel + ' ✗ not found';
    document.getElementById('dcv-ol-model').className = 'dc-val ' + (modelFound ? 'ok' : 'bad');
    if (!modelFound) diagAddLog('WARN', `Ollama model "${olModel}" not found. Run: ollama pull ${olModel}`);
  } catch (e) {
    document.getElementById('dcd-ol-srv').className = 'sdot red';
    document.getElementById('dcv-ol-srv').textContent = 'not running ✗';
    document.getElementById('dcv-ol-srv').className = 'dc-val bad';
    document.getElementById('dcd-ol-model').className = 'sdot grey';
    document.getElementById('dcv-ol-model').textContent = '—';
    document.getElementById('dcv-ol-list').textContent = '—';
    if (provider === 'ollama') {
      const fixCmd = isNoCorsNeeded()
        ? 'ollama serve'
        : 'OLLAMA_ORIGINS="' + window.location.origin + '" ollama serve';
      diagAddLog('ERR', 'Ollama not reachable at ' + olUrl + ' — run: ' + fixCmd);
    }
  }

  // ── OpenAI ──
  const oaiKey = document.getElementById('openai-key').value.trim();
  document.getElementById('dcv-oai-key').textContent = oaiKey.length > 4 ? 'sk-…' + oaiKey.slice(-4) : 'none';
  document.getElementById('dcv-oai-key').className = 'dc-val ' + (oaiKey.length > 4 ? 'ok' : '');
  document.getElementById('dcv-oai-model').textContent = document.getElementById('openai-model').value;
  if (provider === 'openai' && oaiKey.length > 4) {
    document.getElementById('dcd-oai-conn').className = 'sdot checking';
    document.getElementById('dcv-oai-conn').textContent = 'checking…';
    try {
      const t0 = Date.now();
      const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': 'Bearer ' + oaiKey } });
      const ms = Date.now() - t0;
      document.getElementById('dcd-oai-conn').className = 'sdot ' + (r.ok ? 'green' : 'red');
      document.getElementById('dcv-oai-conn').textContent = r.ok ? `OK (${ms}ms)` : `${r.status} error`;
      document.getElementById('dcv-oai-conn').className = 'dc-val ' + (r.ok ? 'ok' : 'bad');
    } catch (e) {
      document.getElementById('dcd-oai-conn').className = 'sdot red';
      document.getElementById('dcv-oai-conn').textContent = 'unreachable';
      document.getElementById('dcv-oai-conn').className = 'dc-val bad';
    }
  } else {
    document.getElementById('dcd-oai-conn').className = 'sdot grey';
    document.getElementById('dcv-oai-conn').textContent = provider === 'openai' ? 'no key' : 'not active';
    document.getElementById('dcv-oai-conn').className = 'dc-val';
  }

  // ── Gemini ──
  const gemKey = document.getElementById('gemini-key').value.trim();
  document.getElementById('dcv-gem-key').textContent = gemKey.length > 4 ? 'AIza…' + gemKey.slice(-4) : 'none';
  document.getElementById('dcv-gem-key').className = 'dc-val ' + (gemKey.length > 4 ? 'ok' : '');
  document.getElementById('dcv-gem-model').textContent = document.getElementById('gemini-model').value;
  if (provider === 'gemini' && gemKey.length > 4) {
    document.getElementById('dcd-gem-conn').className = 'sdot checking';
    document.getElementById('dcv-gem-conn').textContent = 'checking…';
    try {
      const t0 = Date.now();
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + gemKey);
      const ms = Date.now() - t0;
      document.getElementById('dcd-gem-conn').className = 'sdot ' + (r.ok ? 'green' : 'red');
      document.getElementById('dcv-gem-conn').textContent = r.ok ? `OK (${ms}ms)` : `${r.status} error`;
      document.getElementById('dcv-gem-conn').className = 'dc-val ' + (r.ok ? 'ok' : 'bad');
    } catch (e) {
      document.getElementById('dcd-gem-conn').className = 'sdot red';
      document.getElementById('dcv-gem-conn').textContent = 'unreachable';
      document.getElementById('dcv-gem-conn').className = 'dc-val bad';
    }
  } else {
    document.getElementById('dcd-gem-conn').className = 'sdot grey';
    document.getElementById('dcv-gem-conn').textContent = provider === 'gemini' ? 'no key' : 'not active';
    document.getElementById('dcv-gem-conn').className = 'dc-val';
  }

  diagAddLog('INFO', 'Auto-detect complete · active: ' + provider);
}
