import asyncio
from typing import Optional
from app.core.models import IntentAnalysis
from app.core.pipeline.base import PipelineContext
from app.core.pipeline.coordinator import PipelineCoordinator
from app.core.pipeline.safecmd_tool import SafeCmdTool
from app.core.pipeline.cmdcaliper_tool import CmdCaliperTool
from app.core.pipeline.explainshell_tool import ExplainshellTool
from app.core.pipeline.heuristic_tool import HeuristicAnalyzerTool
from app.core.pipeline.script_tool import ScriptIntentAnalyzerTool


class AnalyzerService:
    """
    Service facade coordinating command intent and safety analysis.
    Delegates to a multi-tool PipelineCoordinator composed of SafeCmd,
    CmdCaliper Semantic Vector Safety, Explainshell Ground-Truth Manpages,
    Rule-based Heuristics, Aqua Tracee eBPF Sandbox Script Analyzer,
    and AI Semantic Reasoners (Groq / Ollama / Cloud).
    """

    def __init__(self, pipeline: Optional[PipelineCoordinator] = None):
        self.pipeline = pipeline or PipelineCoordinator()

    def get_provider_status(self) -> str:
        return self.pipeline.get_provider_status()

    def reconfigure(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.pipeline.reconfigure(provider, model)

    async def analyze(
        self,
        command: str,
        cwd: str = "",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        script_content: Optional[str] = None,
        script_name: Optional[str] = None,
    ) -> IntentAnalysis:
        return await self.pipeline.process(
            command,
            cwd,
            provider=provider,
            model=model,
            api_key=api_key,
            script_content=script_content,
            script_name=script_name,
        )

    def _analyze_heuristic(self, command: str, cwd: str = "") -> IntentAnalysis:
        """Synchronous multi-tool analysis fallback for immediate local validation."""
        context = PipelineContext(command=command, cwd=cwd)
        safecmd_tool = SafeCmdTool()
        cmdcaliper_tool = CmdCaliperTool()
        explainshell_tool = ExplainshellTool()
        heuristic_tool = HeuristicAnalyzerTool()
        script_tool = ScriptIntentAnalyzerTool()

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            task1 = loop.create_task(safecmd_tool.process(context))
            task2 = loop.create_task(cmdcaliper_tool.process(context))
            task3 = loop.create_task(explainshell_tool.process(context))
            task4 = loop.create_task(heuristic_tool.process(context))
            task5 = loop.create_task(script_tool.process(context))
        else:
            asyncio.run(safecmd_tool.process(context))
            asyncio.run(cmdcaliper_tool.process(context))
            asyncio.run(explainshell_tool.process(context))
            asyncio.run(heuristic_tool.process(context))
            asyncio.run(script_tool.process(context))

        return self.pipeline._synthesize(context)
