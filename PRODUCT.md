# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
DevOps engineers, SREs, developers, and system administrators running complex, unfamiliar, or potentially destructive shell commands and multi-line scripts who need pre-flight safety analysis, risk assessment, and safe terminal execution.

## Product Purpose
Provide an intelligent pre-flight safety interceptor and telemetry console for Linux shell commands. It decomposes command pipelines into ASTs, matches threats against vector embeddings and heuristic rules, parses official manpage definitions, and uses AI reasoning to predict filesystem/network mutations before execution.

## Positioning
A multi-layered deterministic and semantic safety guardrail combining SafeCmd AST decomposition, CmdCaliper vector similarity search, Explainshell manpage database lookups, and LLM reasoning with live streaming subprocess execution and Docker/eBPF sandboxing.

## Operating Context
Web dashboard connected to a local shell or sandboxed container environment. Used in terminal workflows, DevOps debugging sessions, automation script reviews, and system maintenance where execution mistakes carry high operational risk.

## Capabilities and Constraints
- Multi-tool pre-flight analysis pipeline (SafeCmd AST, CmdCaliper Vector DB, Explainshell SQLite, Heuristic Regex, LLM/SLM reasoning).
- Real-time impact assessment cards with dynamic risk rating (`SAFE`, `CAUTION`, `CRITICAL`), mutation breakdowns (`CREATE`, `MODIFY`, `DELETE`), network footprint, and safer alternatives.
- Interactive live terminal streaming via Xterm.js with ANSI formatting, CWD tracking, and SIGINT/SIGKILL process control.
- Dual execution targets: local host subprocess and isolated Docker container with eBPF runtime event tracing.
- Audit history logging with risk-level filtering and search.
- Multi-provider AI configuration (OpenRouter, Gemini, OpenAI, Ollama).

## Brand Commitments
- Cyberpunk / tactical obsidian terminal aesthetic: dark sleek canvas, glowing telemetry badges, crisp monospaced typography, high-contrast risk indicators (emerald for SAFE, amber for CAUTION, crimson for CRITICAL).
- High responsiveness, micro-animations, glassmorphic cards, and zero friction for terminal operations.

## Evidence on Hand
- `backend/`: FastAPI application with modular routers, AST parser, Explainshell database, and CmdCaliper vector store.
- `frontend/`: React + Vite + TailwindCSS single-page application with Xterm.js terminal integration.
- `data/`: `cmdcaliper_corpus.json`, `cmdcaliper_vectors.npz`.
- `HOW_IT_WORKS.md` and `README.md` documenting architecture, execution flow, and API endpoints.

## Product Principles
- **Pre-flight clarity before action**: Always give the user an instant, unambiguous understanding of what a command will do before any byte is executed.
- **Defense in depth**: Combine deterministic rules and AST validation with semantic AI analysis so neither hallucinations nor obscure flags slip through.
- **Zero-latency terminal fidelity**: Keep terminal streaming and command interaction snappy, accurate to ANSI escape codes, and interruptible at any moment.
- **Constructive guidance**: When a command is risky or dangerous, always suggest safer, non-destructive alternatives and explain the risk clearly.

## Accessibility & Inclusion
- High-contrast visual cues for risk levels (accessible color pairings with clear text and icon indicators, not color alone).
- Full keyboard navigation support for command inputs, history search, and confirmation dialogues.
