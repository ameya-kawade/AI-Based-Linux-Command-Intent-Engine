import logging
import time
from typing import List, Optional

from app.core.models import (
    CmdCaliperVerdict,
    CommandExplanation,
    FilesystemImpact,
    ImpactLevel,
    IntentAnalysis,
    NetworkImpact,
    SafeCmdVerdict,
    ScriptAnalysisVerdict,
)
from app.core.pipeline.base import BasePipelineTool, PipelineContext
from app.core.pipeline.cmdcaliper_tool import CmdCaliperTool
from app.core.pipeline.explainshell_tool import ExplainshellTool
from app.core.pipeline.heuristic_tool import HeuristicAnalyzerTool
from app.core.pipeline.llm_tool import LLMAnalyzerTool
from app.core.pipeline.safecmd_tool import SafeCmdTool
from app.core.pipeline.script_tool import ScriptIntentAnalyzerTool

logger = logging.getLogger(__name__)


class PipelineCoordinator:
    """
    Coordinates execution of all pipeline tools in sequence:
    1. SafeCmd AST Parser & Allowlist Engine
    2. Explainshell Manpage Extractor
    3. CmdCaliper Semantic Vector Safety Engine
    4. Rule-Based Heuristic Security Analyzer
    5. Aqua Tracee eBPF Sandbox & Script Intent Analyzer
    6. Grounded SLM/LLM Reasoning Engine (Groq LPU / Ollama)
    """

    def __init__(self, tools: Optional[List[BasePipelineTool]] = None):
        if tools is not None:
            self.tools = tools
        else:
            self.tools = [
                SafeCmdTool(),
                ExplainshellTool(),
                CmdCaliperTool(),
                HeuristicAnalyzerTool(),
                ScriptIntentAnalyzerTool(),
                LLMAnalyzerTool(),
            ]

    def reconfigure(self, provider: Optional[str] = None, model: Optional[str] = None):
        for t in self.tools:
            if isinstance(t, LLMAnalyzerTool):
                t.reconfigure(provider, model)

    def get_provider_status(self) -> str:
        active_tools = [t.name for t in self.tools if t.is_available()]
        prefix = "SafeCmd + CmdCaliper + Explainshell"

        if any("Groq" in t or "Ollama" in t or "OpenRouter" in t or "Gemini" in t or "OpenAI" in t for t in active_tools):
            llm_name = [t for t in active_tools if any(k in t for k in ("Groq", "Ollama", "OpenRouter", "Gemini", "OpenAI"))][0]
            return f"Pipeline: {prefix} + AI ({llm_name})"

        return f"Pipeline: {prefix} + Heuristics"

    async def process(
        self,
        command: str,
        cwd: str = "",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        script_content: Optional[str] = None,
        script_name: Optional[str] = None,
    ) -> IntentAnalysis:
        start_time = time.perf_counter()
        clean_cmd = command.strip()

        if not clean_cmd:
            return IntentAnalysis(
                command="",
                intent="Empty shell line (no-op)",
                risk_level="SAFE",
                is_reversible=True,
                reversibility_explanation="No command to execute.",
                source="pipeline",
                model_used="SafeCmd + CmdCaliper + Explainshell + Heuristics Pipeline",
                tools_used=[
                    "SafeCmd AST Allowlist Engine",
                    "Explainshell Manpage Engine",
                    "CmdCaliper Semantic Vector Safety Engine",
                    "Rule-Based Heuristics Engine",
                ],
                analysis_time_ms=0,
            )

        context = PipelineContext(
            command=clean_cmd,
            cwd=cwd,
            requested_provider=provider,
            requested_model=model,
            requested_api_key=api_key,
            script_content=script_content,
            script_name=script_name,
        )

        # Execute tools sequentially through the pipeline
        for tool in self.tools:
            if tool.is_available():
                try:
                    await tool.process(context)
                except Exception as e:
                    logger.warning(f"Tool {tool.name} failed during pipeline execution: {e}")

        # Synthesize tool findings into final IntentAnalysis
        analysis = self._synthesize(context)
        analysis.analysis_time_ms = int((time.perf_counter() - start_time) * 1000)
        return analysis

    def _synthesize(self, context: PipelineContext) -> IntentAnalysis:
        raw_warnings: List[str] = list(context.warnings)

        # 1. SafeCmd Policy Alert
        if context.safecmd_verdict and not context.safecmd_verdict.allowed:
            msg = context.safecmd_verdict.message
            if not any("SafeCmd" in w for w in raw_warnings):
                raw_warnings.insert(0, f"[SafeCmd Restriction] {msg}")

        # 2. CmdCaliper Threat Alert
        if context.cmdcaliper_verdict and context.cmdcaliper_verdict.verdict in ("HARMFUL", "SUSPICIOUS"):
            cc_expl = context.cmdcaliper_verdict.explanation
            if not any("CmdCaliper" in w for w in raw_warnings):
                raw_warnings.insert(0, f"[CmdCaliper Threat] {cc_expl}")

        # 3. Script Intent & Tracee Threat Warnings
        if context.script_verdict and context.script_verdict.is_malicious:
            sv = context.script_verdict
            sig_text = f" ({', '.join(sv.detected_signatures)})" if sv.detected_signatures else ""
            warn_msg = f"[Script Threat - {sv.severity}] Script '{sv.script_name}' flagged as malicious{sig_text}."
            if not any("Script Threat" in w for w in raw_warnings):
                raw_warnings.insert(0, warn_msg)

        # Deduplicate warnings preserving order
        warnings = list(dict.fromkeys(raw_warnings))

        # 4. Aggregate Filesystem Impact
        fs = FilesystemImpact(
            created=list(dict.fromkeys(context.filesystem.created)),
            modified=list(dict.fromkeys(context.filesystem.modified)),
            deleted=list(dict.fromkeys(context.filesystem.deleted)),
        )

        # 5. Aggregate Network Impact
        net = NetworkImpact(
            outbound_endpoints=list(dict.fromkeys(context.network.outbound_endpoints)),
            ports_opened=list(dict.fromkeys(context.network.ports_opened)),
            downloads=list(dict.fromkeys(context.network.downloads)),
        )

        # 6. Determine Intent String
        intent = context.llm_intent or context.heuristic_intent
        if not intent:
            if context.script_verdict and context.script_verdict.script_content_provided:
                intent = f"Execute script '{context.script_verdict.script_name}': {context.script_verdict.summary}"
            elif context.manpage_explanation and context.manpage_explanation.synopsis:
                intent = f"Execute '{context.manpage_explanation.command}': {context.manpage_explanation.synopsis}"
            else:
                intent = f"Execute shell command: '{context.command}'"

        # 7. Synthesize Risk Level with Strict Safety Invariants
        risk: ImpactLevel = context.heuristic_risk or "SAFE"
        if context.llm_risk in ("SAFE", "CAUTION", "CRITICAL"):
            risk_order = {"SAFE": 0, "CAUTION": 1, "CRITICAL": 2}
            if risk_order.get(context.llm_risk, 0) > risk_order.get(risk, 0):
                risk = context.llm_risk

        # Invariant 7a: SafeCmd Blocked/Restricted
        if context.safecmd_verdict and not context.safecmd_verdict.allowed:
            if risk == "SAFE":
                risk = "CAUTION"

        # Invariant 7b: CmdCaliper Threat Match
        if context.cmdcaliper_verdict:
            cc = context.cmdcaliper_verdict
            if cc.verdict == "HARMFUL":
                risk = "CRITICAL"
            elif cc.verdict == "SUSPICIOUS" or cc.matched_label == "HARMFUL":
                if "Reverse Shell" in (cc.matched_category or "") or "Exploit" in (cc.matched_category or ""):
                    if cc.similarity_score >= 0.50:
                        risk = "CRITICAL"
                    elif risk == "SAFE":
                        risk = "CAUTION"
                elif risk == "SAFE":
                    risk = "CAUTION"

        # Invariant 7c: Attached Script Threat
        if context.script_verdict and context.script_verdict.script_content_provided:
            sv = context.script_verdict
            if sv.is_malicious or sv.severity in ("CRITICAL", "HIGH"):
                risk = "CRITICAL" if sv.severity == "CRITICAL" else "CAUTION"
            elif sv.severity == "MEDIUM" and risk == "SAFE":
                risk = "CAUTION"

        # Invariant 7d: Network Listener / Open Ports
        if net.ports_opened and risk == "SAFE":
            risk = "CAUTION"

        # 8. Synthesize Reversibility
        is_reversible = True
        if context.heuristic_is_reversible is False:
            is_reversible = False
        elif context.script_verdict and context.script_verdict.is_malicious:
            is_reversible = False
        elif context.cmdcaliper_verdict and context.cmdcaliper_verdict.verdict == "HARMFUL":
            is_reversible = False
        elif risk == "CRITICAL" and (fs.deleted or "Reverse Shell" in getattr(context.cmdcaliper_verdict, "matched_category", "")):
            is_reversible = False

        # 9. Synthesize Reversibility Explanation
        rev_expl = context.heuristic_rev_expl
        if not rev_expl:
            if context.script_verdict and context.script_verdict.is_malicious:
                rev_expl = f"Script '{context.script_verdict.script_name}' executes hazardous system actions; irreversible."
            elif not is_reversible:
                rev_expl = "Permanent state modification or uncontained process execution; cannot be cleanly reverted."
            elif net.ports_opened:
                rev_expl = f"Network socket opened on port {net.ports_opened[0]} until process termination."
            else:
                rev_expl = "Read-only inspection command; causes no persistent state mutations."

        return IntentAnalysis(
            command=context.command,
            intent=intent,
            risk_level=risk,
            is_reversible=is_reversible,
            reversibility_explanation=rev_expl,
            filesystem=fs,
            network=net,
            system_state_changes=context.system_state_changes,
            warnings=warnings,
            suggested_alternatives=list(dict.fromkeys(context.suggested_alternatives)),
            source="pipeline",
            model_used=self.get_provider_status(),
            tools_used=context.tools_executed,
            safecmd=context.safecmd_verdict,
            cmdcaliper=context.cmdcaliper_verdict,
            manpage_explanation=context.manpage_explanation,
            script_analysis=context.script_verdict,
        )

# Backwards compatibility alias
ProcessingPipeline = PipelineCoordinator
