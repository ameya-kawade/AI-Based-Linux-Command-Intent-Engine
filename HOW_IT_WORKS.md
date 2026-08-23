# Linux Command Intent Engine: End-to-End Architectural Pipeline & Workflow

This document explains the technical lifecycle of a shell command or script within the **Linux Command Intent Engine (LCIE)**—from the moment a user types a command in the interface to AST parsing, vector threat matching, ground-truth manpage definition lookup, heuristic security inspection, SLM/LLM semantic synthesis, and real-time execution streaming.

---

## 1. High-Level Architecture & End-to-End Flow

```mermaid
flowchart TD
    subgraph UI["1. User Interface (React + Tailwind + WebSockets)"]
        A[User Types Command / Selects Preset] --> B[AI Provider Selection & Settings]
        B --> C[Animated Radar Scanner]
        C --> D[Impact Card & Pre-Flight Review]
        D --> E{User Decision}
        E -->|Run on Host| F1[WebSocket Stream: Host Engine]
        E -->|Run in Sandbox| F2[WebSocket Stream: Docker Sandbox + Tracee]
        E -->|Edit / Cancel| A
    end

    subgraph API["2. FastAPI Backend Service (Port 8000)"]
        G[POST /api/analyze] --> H[AnalyzerService Facade]
        H --> I[PipelineContext Initialized]
    end

    subgraph Pipeline["3. Multi-Tool Intelligence & Safety Pipeline"]
        I --> T1[Tool 1: SafeCmd AST Allowlist Engine]
        T1 --> T2[Tool 2: Explainshell Ground-Truth SQLite DB]
        T2 --> T3[Tool 3: CmdCaliper 768-dim Vector Threat Engine]
        T3 --> T4[Tool 4: Rule-Based Heuristic Security Analyzer]
        T4 --> T5[Tool 5: Multi-Tool Grounded AI / SLM Reasoner]
        T5 --> S1[Pipeline Coordinator: _synthesize & Invariants]
    end

    subgraph Exec["4. Dual Execution & Telemetry Engine"]
        F1 --> EX1[Subprocess Execution Engine with Async Stream]
        F2 --> EX2[Docker Sandbox API + eBPF Tracee Container]
        EX1 --> H1[History Storage: SQLite Execution Log]
        EX2 --> H1
    end

    A -->|HTTP POST| G
    S1 -->|IntentAnalysis JSON| D
```

---

## 2. Phase 1: User Input & Client Interface Tier

### 1. Command Entry & User Experience (`CommandInput.jsx`)
- **Single-Line & Multi-Line Modes**: Supports single one-liner commands (e.g. `ls -la`) as well as multi-line bash scripts via the integrated script uploader and parser.
- **Preset Catalog**: Categorized sample commands covering *Safe Inspection*, *Pipelines*, *Privilege Escalation*, *Data Deletion*, and *Reverse Shell Threats*.
- **History Navigation**: Up/Down arrow keys recall previous commands from local memory and backend telemetry.

### 2. Provider Settings & AI Reasoning Toggle (`SettingsModal.jsx`, `Header.jsx`)
- Users can dynamically switch between multiple AI providers: OpenRouter, Google Gemini, OpenAI, and local Ollama instances.
- Configurations and API keys are managed securely in the settings modal and transmitted to the backend for intent synthesis.

---

## 3. Phase 2: Core Intelligence Pipeline

The `analyze.py` router delegates to the `PipelineCoordinator`, triggering a suite of deterministic and semantic tools:

1. **SafeCmd Tool**: Validates AST structures (using `bashlex`) to ensure the command conforms to safety profiles.
2. **Explainshell Tool**: Performs precise lookups of command flags using the manpage SQLite database.
3. **CmdCaliper Tool**: Computes 768-dim vector embeddings and cross-references them against MITRE ATT&CK techniques for threat detection.
4. **Heuristic Tool**: Applies regular expression and structural rules for identifying explicit threats like disk wipes or bind shells.
5. **LLM Tool**: Synthesizes the outputs of the previous tools to generate a cohesive intent explanation, utilizing the selected AI provider.

---

## 4. Phase 3: Telemetry, Execution, and Storage

- **Telemetry & History**: Executed commands, along with their full context and risk assessments, are logged via the `history_manager.py`.
- **Live Execution**: `TerminalStream.jsx` handles realtime stdout/stderr streaming via WebSockets, interacting with `routers/execute.py`.
