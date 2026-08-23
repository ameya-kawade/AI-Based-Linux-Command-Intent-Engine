from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


ImpactLevel = Literal["SAFE", "CAUTION", "CRITICAL"]


class FilesystemImpact(BaseModel):
    created: List[str] = Field(default_factory=list, description="Files or directories created")
    modified: List[str] = Field(default_factory=list, description="Files or directories modified")
    deleted: List[str] = Field(default_factory=list, description="Files or directories deleted")


class NetworkImpact(BaseModel):
    outbound_endpoints: List[str] = Field(default_factory=list, description="Network hosts or URLs connected to")
    ports_opened: List[int] = Field(default_factory=list, description="Local ports opened/bound")
    downloads: List[str] = Field(default_factory=list, description="Files downloaded to disk")


class SafeCmdVerdict(BaseModel):
    allowed: bool = Field(..., description="Whether the command passed safecmd allowlist validation")
    disallowed_target: Optional[str] = Field(default=None, description="Disallowed command or path if blocked")
    disallowed_type: Optional[Literal["command", "destination", "syntax", "error"]] = Field(
        default=None, description="Category of the disallowance"
    )
    message: str = Field(default="", description="Human-readable policy message from safecmd")
    extracted_commands: List[List[str]] = Field(
        default_factory=list, description="AST-extracted sub-commands from pipes, substitutions, and subshells"
    )
    redirects: List[Tuple[str, str]] = Field(
        default_factory=list, description="AST-extracted output/input redirections (e.g. ('>', 'file.txt'))"
    )


class VectorSimilarityMatch(BaseModel):
    command: str = Field(..., description="Matched command in vector database")
    similarity: float = Field(..., description="Cosine similarity score (0.0 to 1.0)")
    label: Literal["HARMFUL", "BENIGN"] = Field(..., description="Classification label")
    category: str = Field(default="General", description="Threat or command category")
    description: str = Field(default="", description="Description of the command/threat")
    severity: Optional[str] = Field(default=None, description="Severity rating (Critical, High, Medium, Low)")
    mitre_attack: Optional[str] = Field(default=None, description="MITRE ATT&CK technique tag (e.g. T1059.004)")
    source: Optional[str] = Field(default=None, description="Origin database source")


class CmdCaliperVerdict(BaseModel):
    verdict: Literal["HARMFUL", "BENIGN", "SUSPICIOUS", "UNKNOWN"] = Field(
        ..., description="Overall vector semantic safety verdict"
    )
    confidence: Literal["HIGH", "MEDIUM", "LOW"] = Field(..., description="Confidence level of the verdict")
    similarity_score: float = Field(..., description="Highest similarity score to nearest vector neighbor")
    matched_command: Optional[str] = Field(default=None, description="Nearest matched command in corpus")
    matched_category: Optional[str] = Field(default=None, description="Category of nearest match")
    matched_label: Optional[Literal["HARMFUL", "BENIGN"]] = Field(default=None, description="Label of nearest match")
    matched_mitre: Optional[str] = Field(default=None, description="MITRE ATT&CK tag if applicable")
    explanation: str = Field(default="", description="Detailed human explanation of vector similarity analysis")
    top_matches: List[VectorSimilarityMatch] = Field(
        default_factory=list, description="Top-K closest commands in vector embedding space"
    )
    model_name: str = Field(default="Ameya-Kawade/cmdcaliper", description="SentenceTransformer model name")
    vector_dim: int = Field(default=768, description="Embedding vector dimension")
    db_size: int = Field(default=0, description="Total number of vectors in database")


class FlagExplanation(BaseModel):
    flag: str = Field(..., description="Raw flag entered by user (e.g. '-v', '--all', 'if=/dev/zero')")
    canonical_name: str = Field(default="", description="Canonical option declaration (e.g. '-v, --verbose')")
    summary: str = Field(default="", description="Short first-line explanation of the flag")
    description: str = Field(default="", description="Full markdown text description from manpage")
    has_argument: bool = Field(default=False, description="Whether flag accepts/requires an argument")
    argument_value: Optional[str] = Field(default=None, description="Extracted argument value if provided")
    is_matched: bool = Field(default=True, description="Whether this flag was found in the manpage options")


class CommandExplanation(BaseModel):
    command: str = Field(..., description="Resolved command name or subcommand (e.g. 'tar', 'git commit')")
    manpage_source: str = Field(default="", description="Source manpage identifier (e.g. 'arch/latest/1/tar.1.gz')")
    manpage_url: Optional[str] = Field(default=None, description="Direct reference URL to official manual page (e.g. https://man7.org/linux/man-pages/man1/awk.1p.html)")
    synopsis: str = Field(default="", description="Command synopsis description from manpage")
    used_flags: List[FlagExplanation] = Field(default_factory=list, description="Explanations for ONLY the flags used in the command")
    positional_args: List[str] = Field(default_factory=list, description="Positional operands that are not flags")
    nested_command: Optional["CommandExplanation"] = Field(default=None, description="Nested command explanation if wrapper like sudo/xargs")


class TraceeAlert(BaseModel):
    timestamp: str = Field(default="", description="ISO timestamp of event")
    event_id: Optional[str] = Field(default=None, description="Tracee event ID")
    event_name: str = Field(..., description="eBPF hook/event name (e.g. execve, connect, ptrace)")
    category: str = Field(default="system_call", description="Event category")
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] = Field(
        default="INFO", description="Security severity rating"
    )
    is_security_alert: bool = Field(default=False, description="Whether event triggered a security alert")
    description: str = Field(default="", description="Human-readable description of eBPF trace event")
    process: Dict[str, Any] = Field(default_factory=dict, description="Process metadata (PID, name, UID)")
    details: Dict[str, Any] = Field(default_factory=dict, description="Syscall arguments and matched policies")
    mitre_attack: Optional[str] = Field(default=None, description="MITRE ATT&CK technique tag")


class ScriptAnalysisVerdict(BaseModel):
    script_name: str = Field(default="script.sh", description="Name of the detected script file")
    script_detected_in_command: bool = Field(
        default=True, description="Whether a local script invocation was detected in the command"
    )
    script_content_provided: bool = Field(
        default=True, description="Whether script source code was uploaded/provided"
    )
    is_malicious: bool = Field(default=False, description="Overall verdict on whether the script is harmful")
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"] = Field(
        default="SAFE", description="Script threat severity"
    )
    detected_signatures: List[str] = Field(
        default_factory=list, description="Detected security signatures or attack patterns"
    )
    tracee_alerts: List[TraceeAlert] = Field(
        default_factory=list, description="Normalized eBPF events and security alerts from Tracee"
    )
    network_connections: List[str] = Field(
        default_factory=list, description="Outbound IP/ports connected during execution"
    )
    accessed_files: List[str] = Field(
        default_factory=list, description="Sensitive or system files read/written"
    )
    summary: str = Field(default="", description="High-level summary of script runtime intent and impact")
    script_output: str = Field(default="", description="Standard output/error from script sandbox execution")
    source: Literal["tracee_ebpf", "static_heuristic", "error"] = Field(
        default="tracee_ebpf", description="Analysis engine that produced this verdict"
    )
    execution_time_ms: int = Field(default=0, description="Sandbox run duration in ms")


class IntentAnalysis(BaseModel):
    command: str = Field(..., description="Original command line string")
    intent: str = Field(..., description="Plain-English explanation of what this command will do")
    risk_level: ImpactLevel = Field(..., description="Overall risk classification")
    is_reversible: bool = Field(..., description="Whether this command's mutations can be undone safely")
    reversibility_explanation: str = Field(..., description="Explanation of reversibility or lack thereof")
    filesystem: FilesystemImpact = Field(default_factory=FilesystemImpact, description="Predicted filesystem changes")
    network: NetworkImpact = Field(default_factory=NetworkImpact, description="Predicted network footprint")
    system_state_changes: List[str] = Field(default_factory=list, description="Packages, services, daemons, or kernel state altered")
    warnings: List[str] = Field(default_factory=list, description="Specific safety or security warnings")
    suggested_alternatives: List[str] = Field(default_factory=list, description="Safer or more standard command alternatives")
    source: Literal["llm", "heuristic", "pipeline"] = Field(default="pipeline", description="Origin of the assessment")
    model_used: str = Field(default="", description="Name of LLM or heuristics engine used")
    tools_used: List[str] = Field(default_factory=list, description="List of pipeline tools contributing to this analysis")
    safecmd: Optional[SafeCmdVerdict] = Field(default=None, description="SafeCmd AST allowlist verdict and decomposition")
    cmdcaliper: Optional[CmdCaliperVerdict] = Field(default=None, description="CmdCaliper semantic vector safety analysis")
    manpage_explanation: Optional[CommandExplanation] = Field(
        default=None, description="Explainshell manpage and flag breakdown"
    )
    script_analysis: Optional[ScriptAnalysisVerdict] = Field(
        default=None, description="Aqua Tracee eBPF script intent and runtime trace verdict"
    )
    analysis_time_ms: int = Field(default=0, description="Analysis computation time in milliseconds")


class HistoryItem(BaseModel):
    id: str = Field(..., description="Unique entry ID")
    timestamp: str = Field(..., description="ISO or display timestamp")
    cwd: str = Field(..., description="Working directory when command executed")
    command: str = Field(..., description="Command line string")
    analysis: Optional[IntentAnalysis] = Field(default=None, description="Impact analysis result")
    status: Literal["success", "error", "cancelled", "running"] = Field(default="success")
    output: str = Field(default="", description="Command stdout/stderr output")
    exit_code: Optional[int] = Field(default=None, description="Process exit code")
    duration_ms: Optional[int] = Field(default=None, description="Command execution duration in ms")
