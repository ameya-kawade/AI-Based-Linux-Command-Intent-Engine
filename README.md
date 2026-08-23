# 🌐 Linux Command Intent Engine (Web Edition)

> **Modern Web-Based AI Pre-Flight Shell Safety & Intent Interceptor with Live Terminal Streaming, SafeCmd AST Validation, Explainshell Manpages, and Docker eBPF Sandbox Integration**

The **Web Edition** of the Linux Command Intent Engine provides a completely standalone, full-fidelity web application built on **FastAPI**, **React**, **Vite**, **Xterm.js**, and **TailwindCSS**.

---

## ✨ Key Features

- 🛡️ **Full Multi-Tool Pre-flight Pipeline:**
  - **SafeCmd AST & Policy Sandbox:** Pipeline decomposition and allowlist validation.
  - **CmdCaliper Vector Safety:** High-speed semantic similarity threat detection.
  - **Explainshell Database:** GNU / Linux ground-truth synopsis and interactive flag cards with official manpage definitions.
  - **Rule Heuristics:** Destructive regex patterns, privilege escalations (`sudo`), and mutation risks.
  - **SLM / LLM Semantic Reasoning:** OpenRouter (Gemini / Claude), Google Gemini, OpenAI, Ollama (Phi-4-mini / Qwen), or offline heuristics.
- 📊 **Rich Interactive Impact Assessment Card:**
  - Dynamic risk classification (`[SAFE]`, `[CAUTION]`, `[CRITICAL]`) with glowing pulse animations.
  - Reversibility badges (`[REVERSIBLE]` vs `[IRREVERSIBLE]`).
  - Interactive AST pipeline tree flow and redirection targets.
  - Filesystem mutations breakdown (`+ [CREATE]`, `~ [MODIFY]`, `- [DELETE]`).
  - Network footprint & listening ports breakdown.
  - One-click copyable safer alternative suggestions.
- ⚡ **Real-Time Streaming Terminal (`xterm.js`):**
  - Live stdout/stderr ANSI streaming over WebSockets.
  - Real-time CWD tracking and directory synchronization.
  - Process abortion (`Ctrl+C` / SIGINT & SIGKILL support).
  - Exit code badges and millisecond execution telemetry.
- 🐳 **Dual Execution Modes:**
  - **Local Host Execution:** Real-time subprocess execution on your local machine.
  - **Docker + Tracee eBPF Sandbox:** Dispatches commands to an isolated container with kernel syscall tracking and security event alerts.
- 📜 **Audit History & Configuration:**
  - Filterable command history feed by risk level, search term, and exit status.
  - In-app Settings Modal for switching AI models and API keys with instant backend synchronization.
  - Curated sample command presets for immediate one-click demonstration.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.10+
- Node.js 18+ and npm

### 2. Setup Dependencies

```bash
# Python Backend Dependencies
cd backend
pip install -r requirements.txt
cd ..

# Frontend Dependencies
cd frontend
npm install
npm run build
cd ..
```

### 3. Launch the Application

```bash
# Production mode (serves frontend + API on http://localhost:8000)
./start.sh

# Or Development mode with Vite HMR (FastAPI on :8000, Vite on :5173)
./start.sh dev
```

Open your browser at `http://localhost:8000` (or `http://localhost:5173` in dev mode).

---

## 🏗️ Architecture

```
web/
├── data/                       # Local vector embeddings & datasets
│   ├── cmdcaliper_corpus.json
│   └── cmdcaliper_vectors.npz
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI App & Route Registration
│   │   ├── config.py           # Settings & Environment Loader
│   │   ├── dependencies.py     # Singletons (AnalyzerService, Executor, DB)
│   │   ├── core/               # Standalone Engine Core
│   │   │   ├── models.py       # Pydantic Schemas
│   │   │   ├── analyzer.py     # Analyzer Service Facade
│   │   │   ├── executor.py     # Real-Time Shell Subprocess Streaming
│   │   │   ├── explainshell_db.py # Explainshell Manpage SQLite Parser
│   │   │   ├── vector_db.py    # CmdCaliper Semantic Vector Store
│   │   │   └── pipeline/       # Multi-Tool Pipeline & Coordinator
│   │   ├── routers/
│   │   │   ├── analyze.py      # POST /api/analyze
│   │   │   ├── execute.py      # WS /ws/execute (Host & Sandbox Streaming)
│   │   │   ├── system.py       # GET /api/status, POST /api/settings, GET /api/presets
│   │   │   ├── history.py      # GET/DELETE /api/history
│   │   │   └── manpage.py      # GET /api/manpage/{command}
│   │   └── services/
│   │       ├── history_manager.py
│   │       └── sandbox_client.py
│   ├── tests/
│   │   └── test_api.py         # Automated Pytest Suite
│   ├── requirements.txt
│   └── run_backend.py
│
└── frontend/
    ├── src/
    │   ├── App.jsx             # State Machine (INPUT -> ANALYZING -> CONFIRMATION -> EXECUTING)
    │   ├── main.jsx
    │   ├── index.css           # Glassmorphism, Obsidian Theme & Animations
    │   ├── components/
    │   │   ├── Header.jsx          # Live AI & Telemetry Bar
    │   │   ├── CommandInput.jsx    # Prompt, Presets & History Recall
    │   │   ├── AnalyzingRadar.jsx  # Multi-Stage Scanning Radar
    │   │   ├── ImpactCard.jsx      # Visual Impact Assessment Breakdown
    │   │   ├── ActionControls.jsx  # Host / Sandbox Execution Triggers & Critical Guard
    │   │   ├── TerminalStream.jsx  # Xterm.js Live Output Console
    │   │   ├── HistoryFeed.jsx     # Audit Drawer & Search
    │   │   └── SettingsModal.jsx   # AI Model & Key Configuration
    │   └── services/
    │       └── api.js          # REST Client
    ├── index.html
    ├── vite.config.js
    └── package.json
```
