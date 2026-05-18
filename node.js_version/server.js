'use strict';

require('dotenv').config();

const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const http       = require('http');
const multer     = require('multer');

const app    = express();
const PORT   = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const LEGACY_EXTS = new Set([
  'sh','bash','pl','pm','cob','cbl','f','for','f90','f95',
  'awk','tcl','csh','ksh','zsh','sas','rpg','vbs'
  'rexx','rex','exec'
]);

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    ollama_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  });
});

// ── Scan a server-side directory ──────────────────────────────────
app.post('/api/scan-dir', (req, res) => {
  const { dir_path } = req.body;
  if (!dir_path) return res.status(400).json({ error: 'dir_path required' });

  const absPath = path.resolve(dir_path);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Path not found: ' + absPath });

  let entries;
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch (e) {
    return res.status(403).json({ error: 'Cannot read directory: ' + e.message });
  }

  const files = entries
    .filter(e => e.isFile() && LEGACY_EXTS.has(e.name.split('.').pop().toLowerCase()))
    .map(e => ({
      name: e.name,
      path: path.join(absPath, e.name),
      size: fs.statSync(path.join(absPath, e.name)).size
    }));

  res.json({ dir: absPath, files });
});

// ── Read a file's content ─────────────────────────────────────────
app.post('/api/read-file', (req, res) => {
  const { file_path } = req.body;
  if (!file_path) return res.status(400).json({ error: 'file_path required' });
  try {
    const content = fs.readFileSync(path.resolve(file_path), 'utf8');
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Cannot read file: ' + e.message });
  }
});

// ── Save output files to a server-side directory ──────────────────
app.post('/api/save-outputs', (req, res) => {
  const { output_dir, base_name, docs, tests, converted, converted_ext } = req.body;
  if (!output_dir || !base_name) return res.status(400).json({ error: 'output_dir and base_name required' });

  const absOut = path.resolve(output_dir);
  try { fs.mkdirSync(absOut, { recursive: true }); } catch (e) {
    return res.status(500).json({ error: 'Cannot create output dir: ' + e.message });
  }

  const saved = [];
  const write = (suffix, content) => {
    if (!content) return;
    const fp = path.join(absOut, base_name + suffix);
    fs.writeFileSync(fp, content, 'utf8');
    saved.push(fp);
  };

  try {
    write('_docs.txt',    docs);
    write('_test.' + (converted_ext === 'py' ? 'py' : 'sh'), tests);
    write('.' + (converted_ext || 'txt'), converted);
    res.json({ ok: true, saved });
  } catch (e) {
    res.status(500).json({ error: 'Write failed: ' + e.message });
  }
});

// ── Upload files from browser ─────────────────────────────────────
app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = (req.files || []).map(f => ({
    name: f.originalname,
    content: f.buffer.toString('utf8')
  }));
  res.json({ files });
});

// ── AI proxy — streams SSE back to client ─────────────────────────
app.post('/api/ai', (req, res) => {
  const { provider, system, user, model, max_tokens, temperature } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');
  const done = () => { res.write('data: [DONE]\n\n'); res.end(); };
  const fail = (msg) => { send({ error: msg }); res.end(); };

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key.startsWith('sk-ant-api03-your')) {
      return fail('ANTHROPIC_API_KEY not set in .env');
    }
    proxyAnthropic({ key, model: model || 'claude-sonnet-4-20250514', system, user, max_tokens, temperature }, send, done, fail);
  } else if (provider === 'ollama') {
    const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    proxyOllama({ base, model: model || 'qwen2.5-coder', system, user, max_tokens, temperature }, send, done, fail);
  } else {
    fail('Unknown provider: ' + provider);
  }
});

// ── Anthropic streaming proxy ─────────────────────────────────────
function proxyAnthropic({ key, model, system, user, max_tokens, temperature }, send, done, fail) {
  const body = JSON.stringify({
    model,
    max_tokens: max_tokens || 1000,
    temperature: temperature || 0.1,
    stream: true,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const opts = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }
  };

  const req = https.request(opts, upstream => {
    if (upstream.statusCode !== 200) {
      let errBody = '';
      upstream.on('data', d => errBody += d);
      upstream.on('end', () => {
        try { fail(JSON.parse(errBody)?.error?.message || 'Anthropic error ' + upstream.statusCode); }
        catch { fail('Anthropic error ' + upstream.statusCode); }
      });
      return;
    }
    let buf = '';
    upstream.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') continue;
        try {
          const delta = JSON.parse(d)?.delta?.text || '';
          if (delta) send({ text: delta });
        } catch {}
      }
    });
    upstream.on('end', done);
    upstream.on('error', e => fail(e.message));
  });

  req.on('error', e => fail('Network error: ' + e.message));
  req.write(body);
  req.end();
}

// ── Ollama streaming proxy ────────────────────────────────────────
function proxyOllama({ base, model, system, user, max_tokens, temperature }, send, done, fail) {
  const url = new URL('/v1/chat/completions', base);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const body = JSON.stringify({
    model,
    stream: true,
    temperature: temperature || 0.1,
    max_tokens: max_tokens || 1000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const opts = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ollama'
    }
  };

  const req = transport.request(opts, upstream => {
    if (upstream.statusCode !== 200) {
      fail('Ollama error ' + upstream.statusCode + ' — is Ollama running?');
      upstream.resume();
      return;
    }
    let buf = '';
    upstream.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') continue;
        try {
          const delta = JSON.parse(d)?.choices?.[0]?.delta?.content || '';
          if (delta) send({ text: delta });
        } catch {}
      }
    });
    upstream.on('end', done);
    upstream.on('error', e => fail(e.message));
  });

  req.on('error', e => fail('Cannot reach Ollama at ' + base + ': ' + e.message));
  req.write(body);
  req.end();
}

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  🪨  Rosetta Stone is running');
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  →  Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ not set (check .env)'}`);
  console.log(`  →  Ollama URL:    ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
  console.log('  Press Ctrl+C to stop.\n');
});
