# Sovereign AI Mode

Sovereign AI Mode locks Rosetta Stone to a local Ollama instance — no API keys,
no cloud calls, no data leaves the machine. It's built for air-gapped,
regulated, or otherwise offline-only environments where sending legacy code to
a third-party API isn't an option.

This doc covers hardware sizing, model selection, air-gapped setup, and
quantization guidance. For general Ollama usage (non-sovereign, hybrid setups
where cloud providers are still available), see the [Ollama section of the
main README](../README.md#ollama-local--sovereign-ai).

---

## Turning it on

In the app's **Settings** panel, toggle **🔒 Sovereign AI Mode**. This:

- Switches the active provider to Ollama and disables switching away from it
- Hides the Anthropic, OpenAI, and Gemini fields entirely
- Shows a persistent "Sovereign AI Mode active" banner
- Surfaces the recommended-models list below (with one-click `ollama pull` copy buttons)

The setting is saved to `localStorage` and restored on next launch — once a
machine is set to sovereign mode, it stays that way until someone explicitly
turns it off.

---

## Recommended models

| Model | RAM | Use case |
|---|---|---|
| `qwen2.5-coder:32b` | 24GB | Best quality — primary recommendation for production use |
| `qwen2.5-coder:14b` | 16GB | Best balance — recommended for most laptops and workstations |
| `qwen2.5-coder:7b` | 8GB | Fast — demos, smaller scripts, resource-constrained systems |
| `deepseek-coder-v2:16b` | 24GB | Strong alternative, particularly for COBOL and complex legacy code |

Pull whichever fits your hardware:

```bash
ollama pull qwen2.5-coder:14b
```

RAM figures above are for the quantized GGUF variants Ollama pulls by
default (Q4_K_M). If you need a smaller footprint, Ollama supports pulling
explicit quantizations, e.g. `qwen2.5-coder:14b-q4_0` or `qwen2.5-coder:14b-q3_K_M`
for lower RAM at some cost to output quality — worth testing against your own
scripts before committing to a smaller quant in production.

As a rule of thumb: pick the largest model your hardware can hold entirely in
RAM (or VRAM, if running on GPU). Swapping to disk will work but conversion
times become impractical for anything beyond trivial scripts.

---

## Air-gapped setup

Because Ollama models are large binary blobs, an air-gapped machine can't
`ollama pull` directly. Pull on a connected machine and transfer instead:

```bash
# On a connected machine
ollama pull qwen2.5-coder:14b

# Locate the model blobs (default Ollama storage path)
# macOS/Linux: ~/.ollama/models
# Copy the whole ~/.ollama/models directory to removable media,
# then to the same path on the air-gapped machine.
```

After copying `~/.ollama/models` onto the target machine, start `ollama serve`
there — it will discover the copied models without needing to re-pull.

Alternatively, `ollama create` can build a model from a local Modelfile plus a
GGUF file transferred separately — see the `model-files/` directory in this
repo for examples used in the live demos.

Once Ollama is running locally:

```bash
python3 launch.py
```

`launch.py` has no pip dependencies (stdlib only), so it runs on a bare
air-gapped Python 3.6+ install with nothing else to provision.

---

## Verifying the setup

Before relying on sovereign mode for real work (or a demo), use the
pre-flight check built into the app: it runs automatically at the start of
every conversion when Sovereign Mode is on, and checks:

- Ollama is reachable at the configured base URL (`http://localhost:11434` by default)
- The selected model has actually been pulled

If Ollama isn't responding, the app reports the exact fix (`ollama serve`). If
the model isn't found, it reports the exact pull command. You can also check
connectivity ahead of time via the **Diagnostics** panel → **Auto-Detect** tab.

---

## What sovereign mode does *not* cover

- It does not sandbox or restrict network access itself — it only removes the
  *app's* use of cloud providers. If the underlying machine has other network
  access, that's outside this tool's control.
- It does not vet Ollama itself for air-gapped compliance — verify Ollama's
  own behavior (telemetry, update checks) meets your environment's
  requirements separately.
- Model quality on COBOL and REXX is lower than on Bash/Perl/Python-family
  languages regardless of provider — see the [Known Limitations](../README.md#known-limitations--open-issues)
  section in the main README.
