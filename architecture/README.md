# LCIE Architecture & Pipeline Diagrams

This directory contains standalone, interactive architecture and workflow diagrams for the **Linux Command Intent Engine (LCIE)** compiled using **[Archify](https://github.com/tt-a1i/archify)**.

Both artifacts are self-contained HTML files featuring embedded SVG, dark/light theme switching, pan/zoom controls, focus search, relationship tracing, and high-fidelity PNG/SVG/WebP exports.

---

## Diagrams Overview

### 1. Application Architecture (`app-architecture.html`)
Visualizes the complete system topology across all tiers:
- **Client Tier**: React 18 frontend with animated radar scanner and xterm.js WebSocket terminal.
- **API Gateway**: FastAPI asynchronous endpoints (`/api/analyze`) and streaming sockets (`/ws/execute`).
- **LCIE Core**: Pipeline Coordinator, Host Subprocess Executor, and Aqua Tracee eBPF Sandbox.
- **Intelligence & AI**: Tree-sitter AST Deobfuscator, SafeCmd Allowlist AST, Heuristics, and Groq/Ollama LLMs.
- **Knowledge & Storage**: CmdCaliper 768-dim Vector DB, Explainshell SQLite cache, and execution telemetry.

**Files**:
- **Interactive HTML**: [`app-architecture.html`](./app-architecture.html)
- **JSON Specification**: [`app-architecture.architecture.json`](./app-architecture.architecture.json)
- **Visual Check Contact Sheet**: [`app-architecture.visual-check.html`](./app-architecture.visual-check.html)

---

### 2. Multi-Tool Pipeline Workflow (`pipeline-workflow.html`)
Visualizes the deterministic-semantic inspection pipeline from command intake to natural language explanation:
- **Phase 1: Parse & Deobfuscate**: Tree-sitter Bash normalizes quote stripping, ANSI-C escapes, and static decoders (`base64 -d`, `rev`).
- **Phase 2: Multi-Engine Inspection**: SafeCmd AST allowlist rules, Explainshell manpage lookup, and CmdCaliper vector similarity.
- **Phase 3: Synthesis & Invariants**: Grounded LLM reasoning strictly checked against fail-closed safety invariants before rendering the ImpactCard UI.

**Files**:
- **Interactive HTML**: [`pipeline-workflow.html`](./pipeline-workflow.html)
- **JSON Specification**: [`pipeline-workflow.workflow.json`](./pipeline-workflow.workflow.json)
- **Visual Check Contact Sheet**: [`pipeline-workflow.visual-check.html`](./pipeline-workflow.visual-check.html)

---

## How to View and Re-compile

### Viewing Locally
Open either HTML file directly in any modern web browser:
```bash
# View Application Architecture
xdg-open architecture/app-architecture.html

# View Pipeline Flow
xdg-open architecture/pipeline-workflow.html
```

### Re-validating and Compiling with Archify
```bash
# Validate specifications with Showcase quality profile
node .agents/skills/archify/bin/archify.mjs validate architecture architecture/app-architecture.architecture.json --quality showcase --json
node .agents/skills/archify/bin/archify.mjs validate workflow architecture/pipeline-workflow.workflow.json --quality showcase --json

# Deliver/compile HTML artifacts
node .agents/skills/archify/bin/archify.mjs deliver architecture architecture/app-architecture.architecture.json architecture/app-architecture.html --quality showcase --json
node .agents/skills/archify/bin/archify.mjs deliver workflow architecture/pipeline-workflow.workflow.json architecture/pipeline-workflow.html --quality showcase --json
```
