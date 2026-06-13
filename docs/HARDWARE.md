# Hardware Guide — Running Large Local Models with Rosetta Stone

This guide covers what you actually need to run 32B and 122B parameter models locally for legacy code modernization — with enough context window headroom to process real enterprise scripts, not just toy examples.

> **Why this matters for legacy code:** A 10,000-line COBOL application, a complex Perl framework, or a heavily commented Fortran codebase can easily exceed 50,000–100,000 tokens. The model needs to hold the entire script in context simultaneously to produce a coherent conversion. A small context window doesn't just slow things down — it silently truncates your input and produces broken output without telling you why.

---

## The Math You Need to Know

Model memory requirements are determined by two things: **parameter count** and **quantization level**.

### Model footprint by quantization

| Quantization | Bits per param | 32B model size | 122B model size |
|---|---|---|---|
| F16 (unquantized) | 16-bit | ~64 GB | ~244 GB |
| Q8 | 8-bit | ~32 GB | ~122 GB |
| Q4 (standard) | 4-bit | ~18–20 GB | ~65–70 GB |
| Q3 | 3-bit | ~14 GB | ~50 GB |

Lower quantization = smaller footprint, faster inference, lower quality. For code conversion tasks, Q4 is the practical minimum — below that, code generation quality degrades noticeably, particularly for structured output like YAML and HCL.

### Context window overhead

This is the part most hardware guides skip. Every token in your context window costs additional memory at inference time. The formula:

```
context_memory_GB ≈ (context_length × num_layers × head_dim × 2) / 1e9
```

In practical terms for the models we care about:

| Model | Context | Approx. extra memory needed |
|---|---|---|
| 32B | 8K tokens | ~2 GB |
| 32B | 32K tokens | ~8 GB |
| 32B | 64K tokens | ~16 GB |
| 32B | 128K tokens | ~32 GB |
| 122B | 8K tokens | ~6 GB |
| 122B | 32K tokens | ~24 GB |
| 122B | 64K tokens | ~48 GB |

**This is the binding constraint for large legacy applications.** A 32B model at Q4 needs ~20 GB just to load. Add a 64K context window and you're at ~36 GB before the OS takes its cut. This is why 24 GB VRAM systems hit a wall on real enterprise codebases even though they handle the model load fine.

### What "large legacy application" means in tokens

| Script type | Rough size | Estimated tokens |
|---|---|---|
| Simple shell script | 100–300 lines | 500–2K |
| Moderate Perl/AWK | 500–1,500 lines | 3K–10K |
| Large Bash framework | 2,000–5,000 lines | 12K–30K |
| Enterprise COBOL program | 5,000–15,000 lines | 30K–90K |
| Full Fortran codebase | 10,000–30,000 lines | 60K–180K |

For anything in the bottom two rows, you need a machine that can hold the model **and** a 64K–128K context window simultaneously. That's the design target for this guide.

---

## Apple — The Unified Memory Route

Apple's M-series chips use **Unified Memory Architecture (UMA)**: the CPU and GPU share a single pool of ultra-fast RAM. There is no separate VRAM to overflow from. The entire model and context window live in one contiguous, high-bandwidth pool.

This fundamentally changes the economics. A Mac with 128 GB of unified memory can run a 32B model with a 128K context window — something that would require multiple high-end NVIDIA cards on a traditional PC.

### Memory bandwidth

Memory bandwidth is what determines tokens-per-second. More bandwidth = faster inference, regardless of raw clock speed.

| Chip | Memory bandwidth |
|---|---|
| M4 Pro | 273 GB/s |
| M4 Max | 546 GB/s |
| M4 Ultra | 819 GB/s |
| M3 Max | 400 GB/s |
| M2 Ultra | 800 GB/s |

**Always buy the Max or Ultra variant** for LLM work. The base Pro chips have significantly lower bandwidth and will turn inference into a waiting exercise.

### Recommended Apple configurations

**32B models — comfortable operation with large context windows**

| Machine | Spec | 32B Q4 headroom | Max practical context |
|---|---|---|---|
| MacBook Pro | M4 Max, 48 GB | Tight — workable for most scripts | ~32K tokens |
| MacBook Pro | M4 Max, 64 GB | Comfortable | ~64K tokens |
| MacBook Pro | M4 Max, 128 GB | Generous | ~128K tokens |
| Mac Studio | M4 Max, 64 GB | Comfortable | ~64K tokens |
| Mac Studio | M4 Max, 128 GB | Generous | ~128K tokens |
| Mac Studio | M4 Ultra, 192 GB | Abundant | 128K+ tokens |

**122B models — requires serious memory**

| Machine | Spec | 122B Q4 headroom | Max practical context |
|---|---|---|---|
| Mac Studio | M4 Ultra, 192 GB | Workable | ~32K tokens |
| Mac Pro | M4 Ultra, 192 GB | Workable | ~32K tokens |
| Mac Pro | M4 Ultra, 512 GB | Generous | ~128K tokens |

> **Note on 122B and Apple:** The 192 GB M4 Ultra Mac Studio is the entry point for 122B at Q4. At ~70 GB model footprint, you have ~120 GB left for OS, context, and overhead. That's enough for a 32K–48K context window — sufficient for most individual legacy scripts but tight for very large COBOL programs. The 512 GB Mac Pro is the only off-the-shelf Apple configuration that gives you real breathing room at 122B with a large context window.

### Apple performance expectations

Expect 15–30 tokens/sec on a 32B Q4 model on an M4 Max 64 GB. Slower than a dedicated high-end NVIDIA GPU, but the memory capacity advantage is substantial. For legacy code conversion — which is a batch workload, not a real-time chat — this speed is entirely acceptable.

---

## Dell (and PC Broadly) — The Dedicated VRAM Route

Traditional PC inference runs primarily on VRAM. If the model doesn't fit entirely in VRAM, it spills into system RAM and performance collapses — often by 10x or more. This makes VRAM capacity the hard constraint, not a soft one.

### The VRAM ceiling problem

| GPU | VRAM | 32B Q4 fits? | Context headroom | 122B Q4 fits? |
|---|---|---|---|---|
| RTX 4090 | 24 GB | Barely (Q4 only, tight) | Very limited | No |
| RTX 5090 | 32 GB | Yes, comfortably | ~8–12K tokens | No |
| RTX 5000 Ada | 32 GB | Yes, comfortably | ~8–12K tokens | No |
| RTX 6000 Ada | 48 GB | Yes, with room | ~32K tokens | No |
| 2× RTX 4090 | 48 GB combined | Yes, with room | ~32K tokens | No |
| 2× RTX 5090 | 64 GB combined | Yes, generously | ~64K tokens | Tight (Q3) |
| H100 (80 GB) | 80 GB | Yes, generously | ~64K tokens | Tight (Q4) |
| 2× H100 | 160 GB | Yes, abundantly | 128K+ | Yes (Q4) |

For enterprise-scale legacy code conversion at 122B, single consumer GPU setups are not viable. You are looking at professional or datacenter hardware.

### Recommended Dell configurations

**32B models — single GPU setups**

| System | GPU | Notes |
|---|---|---|
| Alienware Aurora R16 | RTX 5090 (32 GB) | Best consumer single-GPU option. Q4 32B fits with room for moderate context windows (~12K tokens). |
| Dell Precision 5860 Tower | RTX 5000 Ada (32 GB) | Workstation reliability, same VRAM as 5090. Better for sustained batch workloads. |
| Dell Precision 7960 Tower | RTX 6000 Ada (48 GB) | Substantial context headroom for large scripts. First Dell config that can comfortably process large COBOL programs. |

**32B models — dual GPU setups (for large context windows)**

| System | GPU config | Combined VRAM | Notes |
|---|---|---|---|
| Dell Precision 7960 Tower | 2× RTX 5090 | 64 GB | Requires NVLink workarounds on consumer cards — Linux preferred. Gives genuine 64K context headroom. |
| Dell Precision 7960 Tower | 2× RTX 6000 Ada | 96 GB | Clean multi-GPU support, professional cards. 128K context window becomes viable. |

**122B models — professional/datacenter only**

| System | GPU config | Combined VRAM | Notes |
|---|---|---|---|
| Dell Precision 7960 | 2× RTX 6000 Ada | 96 GB | Q3 quantization required. Tight but functional for moderate context. |
| Dell PowerEdge (server) | 2× H100 80 GB | 160 GB | Full Q4 122B with 64K+ context. This is the serious enterprise path. |

### Important Dell/PC caveats

**NVLink on consumer cards is gone.** RTX 4090 and 5090 do not support NVLink. Multi-GPU inference on consumer cards requires the model to be split across cards via PCIe, which is slower and requires software support (llama.cpp handles this, but it is not seamless). Professional Ada cards (5000, 6000) do support NVLink and give cleaner multi-GPU behavior.

**CUDA ecosystem advantage.** The PC path has the best software support for quantization tools, fine-tuning, and optimization — if you're doing anything beyond pure inference, the CUDA ecosystem is richer. This matters if you're building custom Ollama ModelFiles or fine-tuning on your own legacy script corpus.

**Power draw.** An RTX 5090 pulls 575W at load. A dual 6000 Ada workstation can exceed 1,000W sustained. Plan your power infrastructure accordingly.

---

## Quick Comparison

| Scenario | Recommended hardware | Why |
|---|---|---|
| Moderate scripts, 32B, <32K context | Mac Studio M4 Max 64 GB | Best price/performance/simplicity |
| Large scripts, 32B, 64K+ context | Mac Studio M4 Max 128 GB or Mac Studio M4 Ultra 192 GB | Unified memory scales cleanly |
| Raw speed priority, 32B | Dell Alienware / Precision with RTX 5090 | Fastest single-GPU inference |
| Enterprise COBOL/Fortran, 32B, 128K context | Mac Studio M4 Ultra 192 GB or Dell Precision 2× RTX 6000 Ada | Only configs with enough headroom |
| 122B models, moderate context | Mac Pro M4 Ultra 192 GB | Entry point for 122B; tight but workable |
| 122B models, large context | Mac Pro M4 Ultra 512 GB or Dell PowerEdge 2× H100 | No shortcuts here |

---

## Practical Guidance for Rosetta Stone

### What to set in the app

When running large models locally, the Rosetta Stone app will warn you if a script exceeds your model's context capacity. To get the most out of your hardware:

- Set **Max tokens per request** in Settings to 4000 for large conversion tasks — this gives the model room to generate complete Ansible playbooks or full Python modules without truncation
- The app automatically queries Ollama's `/api/ps` endpoint to detect your model's current context window and expands it if needed (up to 16K tokens auto-expansion)
- For scripts that trigger the "too large for Ollama" red banner, that's the app telling you the combination of model size + context exceeds what it detected as your safe limit — this is hardware-bound, not a software bug

### Choosing quantization for code tasks

For legacy code conversion specifically:

- **Q4_K_M** is the recommended minimum — the `_K_M` variant uses mixed quantization that preserves critical layers at higher precision, which matters for structured output
- **Q5_K_M or Q8** if you have the VRAM/unified memory headroom — noticeably better on COBOL and REXX where the model needs to track complex data division structures
- **Q3 and below** — avoid for code tasks. The quality degradation on structured output (YAML, HCL, Go) is significant and you'll see more hallucinated syntax

### Recommended models for this use case

These are the models that have performed best on the Rosetta Stone conversion tasks during testing:

| Model | Size | Best for |
|---|---|---|
| `qwen2.5-coder:32b` | 32B | Primary recommendation — strong on all target languages |
| `deepseek-coder-v2:16b` | 16B | Good balance of speed and quality if 32B is too slow |
| `codellama:34b` | 34B | Strong on Fortran and COBOL specifically |
| `llama3.1:70b` | 70B | Better reasoning for complex migration decisions |
| `qwen2.5-coder:72b` | 72B | Best quality below 122B — requires 48 GB+ VRAM or 64 GB+ unified memory |

For the 122B tier, **Qwen2.5-Coder 122B** is the target model — it represents the current state of the art for code-specific local models.

---

## Cost Reality Check

| Configuration | Approx. cost (USD) | Best for |
|---|---|---|
| Mac Mini M4 Pro 24 GB | ~$1,400 | Small scripts only, 7B–14B models |
| Mac Studio M4 Max 64 GB | ~$2,600 | 32B models, most legacy scripts |
| Mac Studio M4 Max 128 GB | ~$3,800 | 32B models, large context windows |
| Mac Studio M4 Ultra 192 GB | ~$7,000 | 32B comfortably, 122B tight |
| Mac Pro M4 Ultra 512 GB | ~$15,000+ | 122B with full context headroom |
| Dell Alienware RTX 5090 | ~$3,500–4,500 | Fast 32B, limited context |
| Dell Precision 2× RTX 6000 Ada | ~$15,000–20,000 | 32B with large context, serious workloads |
| Dell PowerEdge 2× H100 | ~$60,000+ | Enterprise 122B — datacenter territory |

For most developers and teams evaluating Rosetta Stone locally, the **Mac Studio M4 Max with 64 GB or 128 GB** is the practical sweet spot — it handles the full range of legacy scripts short of very large COBOL programs, requires no configuration beyond `ollama pull`, and doesn't need a dedicated power circuit.

For teams with serious COBOL and Fortran migration workloads at scale, the **192 GB Mac Studio M4 Ultra** or a **cloud-based inference option** (Anthropic API, which offers 200K context natively) is the more honest recommendation.

---

## When to Use Cloud Instead

No shame in this. For large legacy codebases, the Anthropic API gives you:

- 200K token context window — handles virtually any single legacy script
- No hardware investment
- Faster iteration on complex conversions

The sovereign AI path (fully local, no external API calls) is the right goal for air-gapped environments, regulated industries, and cost-sensitive operations at scale. But if you're evaluating the tool or processing a one-time migration backlog, cloud inference is a completely valid choice and the Rosetta Stone app supports it natively.

---

*Hardware specs and pricing current as of mid-2026. GPU and Mac configurations evolve rapidly — verify current availability before purchasing.*
