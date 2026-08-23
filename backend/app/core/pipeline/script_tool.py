import logging
import os
import re
from typing import Any, Dict, List, Optional

from app.core.models import ScriptAnalysisVerdict, TraceeAlert
from app.core.pipeline.base import BasePipelineTool, PipelineContext
from app.services.sandbox_client import SandboxClient

logger = logging.getLogger(__name__)


class ScriptIntentAnalyzerTool(BasePipelineTool):
    """
    Analyzes shell command strings for referenced bash/shell scripts, accepts attached
    script contents, and performs isolated runtime behavioral profiling using
    Aqua Tracee eBPF kernel probes (or static heuristic fallback if Docker is offline).
    """

    def __init__(self, sandbox_client: Optional[SandboxClient] = None):
        self.sandbox_client = sandbox_client or SandboxClient()

    @property
    def name(self) -> str:
        return "Aqua Tracee eBPF Script Intent & Runtime Profiler"

    @property
    def description(self) -> str:
        return "Runtime behavioral monitoring, syscall tracing, and threat signature detection for bash scripts"

    def is_available(self) -> bool:
        return True

    def detect_script_reference(self, cmd: str) -> Optional[str]:
        """
        Detects if command refers to a local shell script.
        Matches patterns like:
          - ./script.sh, ./run, /path/to/build.sh
          - bash deploy.sh, sh install.sh, zsh setup.sh, python run.py
          - chmod +x run.sh && ./run.sh
        """
        clean_cmd = cmd.strip()
        if not clean_cmd:
            return None

        # Pattern 1: Direct path execution (./script.sh, /tmp/script.sh, ./install)
        match = re.search(r"(?:^|[\s;&|])(?:\.?/|\./)([\w\-./]+\.(?:sh|bash|py|rb|pl|zsh))(?:\s|$)", clean_cmd)
        if match:
            return os.path.basename(match.group(1))

        # Pattern 2: Interpreter execution (bash script.sh, sh ./test.sh, python3 script.py)
        match = re.search(r"\b(?:bash|sh|zsh|dash|python3?|perl|ruby)\s+([^\s;&|]+\.(?:sh|bash|py|rb|pl|zsh))\b", clean_cmd)
        if match:
            return os.path.basename(match.group(1))

        # Pattern 3: Dot-slash executable without extension (e.g. ./install, ./deploy)
        match = re.search(r"(?:^|[\s;&|])(?:\./)([\w\-]+)(?:\s|$)", clean_cmd)
        if match:
            cand = match.group(1)
            # Avoid matching standard builtins or common system binaries without path
            if cand not in ("echo", "cat", "ls", "grep", "cd", "pwd", "true", "false", "exit", "test"):
                return cand

        return None

    def _analyze_script_statically(self, script_content: str, script_name: str) -> ScriptAnalysisVerdict:
        """Fallback static AST / regex analyzer for script content when Docker daemon is not available."""
        signatures: List[str] = []
        alerts: List[TraceeAlert] = []
        network_conns: List[str] = []
        accessed_files: List[str] = []
        severity = "SAFE"
        is_malicious = False

        lines = script_content.splitlines()

        # 1. Reverse shell detection
        if re.search(r"\b(nc|ncat|netcat)\s+.*-e\s+/bin/(ba)?sh", script_content) or "/dev/tcp/" in script_content:
            signatures.append("Reverse Interactive Shell Execution")
            severity = "CRITICAL"
            is_malicious = True
            alerts.append(
                TraceeAlert(
                    event_name="security_alert_reverse_shell",
                    category="signature_detection",
                    severity="CRITICAL",
                    is_security_alert=True,
                    description="Script spawns an unauthenticated reverse interactive shell back to remote listener.",
                    details={"matched_pattern": "reverse_shell"},
                    mitre_attack="T1059.004",
                )
            )

        # 2. Shadow file / credential exfiltration
        if "/etc/shadow" in script_content:
            signatures.append("Shadow Password Hash Access")
            if severity != "CRITICAL":
                severity = "HIGH"
            is_malicious = True
            accessed_files.append("/etc/shadow")
            alerts.append(
                TraceeAlert(
                    event_name="sensitive_file_read",
                    category="sensitive_file_access",
                    severity="HIGH",
                    is_security_alert=True,
                    description="Script accesses sensitive credential database: /etc/shadow",
                    details={"path": "/etc/shadow"},
                    mitre_attack="T1003.008",
                )
            )

        # 3. Network socket connections
        for match in re.finditer(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", script_content):
            ip = match.group(0)
            if not ip.startswith("127.") and ip != "0.0.0.0":
                if ip not in network_conns:
                    network_conns.append(ip)

        # 4. Data destruction / wiping
        if "rm -rf /" in script_content or re.search(r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+/\*", script_content):
            signatures.append("Root Filesystem Destruction")
            severity = "CRITICAL"
            is_malicious = True
            alerts.append(
                TraceeAlert(
                    event_name="destructive_unlink",
                    category="filesystem_mutation",
                    severity="CRITICAL",
                    is_security_alert=True,
                    description="Script recursively unlinks operating system files.",
                    details={"path": "/"},
                    mitre_attack="T1485",
                )
            )

        # 5. Magic SysRq Trigger
        if "/proc/sysrq-trigger" in script_content:
            signatures.append("Direct Kernel Crash Trigger")
            severity = "CRITICAL"
            is_malicious = True
            alerts.append(
                TraceeAlert(
                    event_name="kernel_crash_invocation",
                    category="kernel_mutation",
                    severity="CRITICAL",
                    is_security_alert=True,
                    description="Script attempts to force immediate kernel reboot/panic via SysRq.",
                    details={"path": "/proc/sysrq-trigger"},
                    mitre_attack="T1529",
                )
            )

        summary_parts = []
        if is_malicious:
            summary_parts.append(f"Static security heuristic flagged script '{script_name}' as {severity} risk.")
            if signatures:
                summary_parts.append(f"Detected signatures: {', '.join(signatures)}.")
            if accessed_files:
                summary_parts.append(f"Accessed sensitive targets: {', '.join(accessed_files)}.")
            if network_conns:
                summary_parts.append(f"Targeted external IPs: {', '.join(network_conns)}.")
        else:
            summary_parts.append(f"Static heuristic found no known malicious signatures in '{script_name}'.")

        return ScriptAnalysisVerdict(
            script_name=script_name,
            script_detected_in_command=True,
            script_content_provided=True,
            is_malicious=is_malicious,
            severity=severity,  # type: ignore
            detected_signatures=signatures,
            tracee_alerts=alerts,
            network_connections=network_conns,
            accessed_files=accessed_files,
            summary=" ".join(summary_parts),
            script_output="[Static Heuristic Analysis - Docker Tracee Sandbox was not invoked]",
            source="static_heuristic",
            execution_time_ms=5,
        )

    def _normalize_tracee_response(self, res: Dict[str, Any], script_name: str, script_content: str) -> ScriptAnalysisVerdict:
        """Transforms Docker + Tracee daemon JSON output into a structured ScriptAnalysisVerdict with static defense-in-depth."""
        tracee_alerts_raw = res.get("tracee_alerts", [])
        alerts: List[TraceeAlert] = []
        detected_signatures: List[str] = []
        network_conns: List[str] = []
        accessed_files: List[str] = []
        highest_severity: str = "SAFE"

        for raw in tracee_alerts_raw:
            alert = TraceeAlert(
                timestamp=raw.get("timestamp", ""),
                event_id=raw.get("event_id"),
                event_name=raw.get("event_name", "ebpf_event"),
                category=raw.get("category", "system_call"),
                severity=raw.get("severity", "INFO"),
                is_security_alert=raw.get("is_security_alert", False),
                description=raw.get("description", ""),
                process=raw.get("process", {}),
                details=raw.get("details", {}),
                mitre_attack=raw.get("details", {}).get("mitre_attack"),
            )
            alerts.append(alert)

            if alert.is_security_alert and alert.severity in ("CRITICAL", "HIGH", "MEDIUM"):
                if alert.event_name not in detected_signatures and alert.category == "signature_detection":
                    detected_signatures.append(alert.event_name)

                # Severity promotion
                if alert.severity == "CRITICAL":
                    highest_severity = "CRITICAL"
                elif alert.severity == "HIGH" and highest_severity != "CRITICAL":
                    highest_severity = "HIGH"
                elif alert.severity == "MEDIUM" and highest_severity not in ("CRITICAL", "HIGH"):
                    highest_severity = "MEDIUM"

            if alert.category == "network_activity" or "connect" in alert.event_name:
                args = raw.get("details", {}).get("args", {})
                addr = args.get("addr") or args.get("pathname") or ""
                if addr and str(addr) not in network_conns:
                    network_conns.append(str(addr))

            if alert.category == "sensitive_file_access":
                args = raw.get("details", {}).get("args", {})
                path = args.get("pathname") or args.get("path") or ""
                if path and str(path) not in accessed_files:
                    accessed_files.append(str(path))

        # Merge static signatures as defense-in-depth
        static_verdict = self._analyze_script_statically(script_content, script_name)
        for sig in static_verdict.detected_signatures:
            if sig not in detected_signatures:
                detected_signatures.append(sig)
        for sa in static_verdict.tracee_alerts:
            if not any(a.description == sa.description for a in alerts):
                alerts.append(sa)
        for f in static_verdict.accessed_files:
            if f not in accessed_files:
                accessed_files.append(f)
        for n in static_verdict.network_connections:
            if n not in network_conns:
                network_conns.append(n)

        if static_verdict.severity == "CRITICAL":
            highest_severity = "CRITICAL"
        elif static_verdict.severity == "HIGH" and highest_severity != "CRITICAL":
            highest_severity = "HIGH"

        meta = res.get("metadata", {})
        duration_ms = meta.get("duration_ms", 0)
        script_output = res.get("script_output", "")

        is_malicious = highest_severity in ("CRITICAL", "HIGH") or len(detected_signatures) > 0 or any(a.is_security_alert for a in alerts)

        summary_parts = []
        if is_malicious:
            summary_parts.append(f"Aqua Tracee eBPF flagged script '{script_name}' as {highest_severity} risk.")
            if detected_signatures:
                summary_parts.append(f"Matched threat signatures: {', '.join(detected_signatures)}.")
            if accessed_files:
                summary_parts.append(f"Accessed sensitive paths: {', '.join(accessed_files)}.")
            if network_conns:
                summary_parts.append(f"Network connections attempted: {', '.join(network_conns)}.")
        else:
            summary_parts.append(f"Script '{script_name}' executed cleanly in sandbox with no security violations detected.")

        return ScriptAnalysisVerdict(
            script_name=script_name,
            script_detected_in_command=True,
            script_content_provided=True,
            is_malicious=is_malicious,
            severity=highest_severity,  # type: ignore
            detected_signatures=detected_signatures,
            tracee_alerts=alerts,
            network_connections=network_conns,
            accessed_files=accessed_files,
            summary=" ".join(summary_parts),
            script_output=script_output,
            source="tracee_ebpf",
            execution_time_ms=duration_ms,
        )

    async def process(self, context: PipelineContext) -> None:
        detected_script_name = self.detect_script_reference(context.command)
        if detected_script_name:
            context.script_reference_detected = detected_script_name

        script_content = (context.script_content or "").strip()
        script_name = context.script_name or detected_script_name or "script.sh"

        if not script_content:
            if detected_script_name:
                context.script_verdict = ScriptAnalysisVerdict(
                    script_name=detected_script_name,
                    script_detected_in_command=True,
                    script_content_provided=False,
                    is_malicious=False,
                    severity="SAFE",
                    summary=f"Script '{detected_script_name}' referenced in command line. Upload script code for dynamic Tracee eBPF behavioral analysis.",
                    source="error",
                )
            return

        # Script content is provided - run dynamic Tracee sandbox or fallback to static
        try:
            sandbox_res = await self.sandbox_client.analyze_script(script_content)
            if sandbox_res.get("status") == "success" or "tracee_alerts" in sandbox_res:
                verdict = self._normalize_tracee_response(sandbox_res, script_name, script_content)
                context.tools_executed.append("Aqua Tracee eBPF Sandbox")
            else:
                logger.info(f"Sandbox offline ({sandbox_res.get('error')}); running static heuristic analysis.")
                verdict = self._analyze_script_statically(script_content, script_name)
                context.tools_executed.append("Static Script Security Analyzer")
        except Exception as e:
            logger.warning(f"Error invoking sandbox client: {e}; falling back to static inspection")
            verdict = self._analyze_script_statically(script_content, script_name)
            context.tools_executed.append("Static Script Security Analyzer")

        context.script_verdict = verdict

        # Feed script threat intelligence into pipeline context
        if verdict.is_malicious:
            context.heuristic_risk = "CRITICAL" if verdict.severity == "CRITICAL" else "CAUTION"
            context.heuristic_is_reversible = False
            for sig in verdict.detected_signatures:
                context.warnings.append(f"[Script Threat Signature] {sig} detected in script '{script_name}'")
            for f in verdict.accessed_files:
                context.warnings.append(f"[Sensitive File Access] Script accessed sensitive target: {f}")
            for net in verdict.network_connections:
                context.warnings.append(f"[Script Outbound Network] Script opened network connection to: {net}")
                if net not in context.network.outbound_endpoints:
                    context.network.outbound_endpoints.append(net)

            # Suggest safer script inspection alternatives
            safe_alt1 = f"bash -n {script_name} (Syntax-check script without executing)"
            safe_alt2 = f"shellcheck {script_name} (Static security audit & lint analysis)"
            if safe_alt1 not in context.suggested_alternatives:
                context.suggested_alternatives.append(safe_alt1)
            if safe_alt2 not in context.suggested_alternatives:
                context.suggested_alternatives.append(safe_alt2)
