# Red Hat Conference 2026 — Demo Resources & Code

## Modernizing Legacy Automation With AI + Ansible + Ollama<br><br>
This repository contains all materials used for the 2026 Red Hat Conference in Atlanta, including:<br>
Ollama ModelFiles used to build and run customized local LLMs<br>
Code to convert legacy shell scripts into Ansible playbooks<br>
Demonstrations of AI‑assisted automation pipelines<br>
Slides, examples, and hands‑on workshop files<br>
These assets support the sessions focused on AI‑accelerated automation, Ansible modernization, and governance‑ready LLM workflows.<br>

## Overview<br>
Modern enterprises still run thousands of aging shell scripts, cron jobs, and procedural automations.<br>
This repo demonstrates how to:<br>

Use local LLMs (Ollama) to analyze, normalize, and refactor legacy scripts<br>
Automatically convert them into Ansible YAML playbooks<br>
Enforce company‑ready controls around reproducibility and compliance<br>
Showcase portable, offline‑friendly AI infrastructure for enterprise automation teams<br>

These demos are designed to be reproducible on Linux, macOS, and zLinux.<br>

llama ModelFiles<br>
The model-files/ directory contains the custom Ollama ModelFiles used in the live demos.<br>
These models are designed for:<br>

Legacy‑script analysis<br>
YAML and structured‑data generation<br>
Safety‑first refactoring<br>
Local/offline execution<br>
Running on developer laptops, containers, or zLinux<br>

## Build a Model<br><br>
```
ollama create legacy2ansible -f model-files/legacy2ansible.modelfile
```
## Run the Model<br>
```
ollama run legacy2ansible<br>
```
Legacy Script → Ansible Converter<br>
The scripts/ folder contains:<br>

The Python-based converter that integrates with an LLM backend<br>
Sample legacy scripts<br>


