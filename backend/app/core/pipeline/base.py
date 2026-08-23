from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.core.models import (
    SafeCmdVerdict,
    CmdCaliperVerdict,
    FilesystemImpact,
    NetworkImpact,
    ImpactLevel,
    CommandExplanation,
    ScriptAnalysisVerdict,
)


class PipelineContext(BaseModel):
    """Execution context passed through the multi-tool processing pipeline."""
    command: str
    cwd: str = ""
    tokens: List[str] = Field(default_factory=list)

    # Optional runtime overrides for AI provider / model / key
    requested_provider: Optional[str] = None
    requested_model: Optional[str] = None
    requested_api_key: Optional[str] = None

    # Optional attached script content and script filename
    script_content: Optional[str] = None
    script_name: Optional[str] = None
    script_reference_detected: Optional[str] = None
    script_verdict: Optional[ScriptAnalysisVerdict] = None

    # Tool outputs accumulated
    safecmd_verdict: Optional[SafeCmdVerdict] = None
    cmdcaliper_verdict: Optional[CmdCaliperVerdict] = None
    manpage_explanation: Optional[CommandExplanation] = None
    heuristic_risk: Optional[ImpactLevel] = None
    heuristic_intent: Optional[str] = None
    heuristic_is_reversible: Optional[bool] = None
    heuristic_rev_expl: Optional[str] = None
    filesystem: FilesystemImpact = Field(default_factory=FilesystemImpact)
    network: NetworkImpact = Field(default_factory=NetworkImpact)
    system_state_changes: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    suggested_alternatives: List[str] = Field(default_factory=list)

    llm_intent: Optional[str] = None
    llm_risk: Optional[ImpactLevel] = None
    llm_data: Optional[Dict[str, Any]] = None

    tools_executed: List[str] = Field(default_factory=list)


class BasePipelineTool(ABC):
    """Abstract base class for all tools in the command processing pipeline."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool human-readable name / identifier."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Brief summary of tool functionality."""
        pass

    def is_available(self) -> bool:
        """Check if this tool is configured and available to run."""
        return True

    @abstractmethod
    async def process(self, context: PipelineContext) -> None:
        """Process the command and mutate the pipeline context with tool findings."""
        pass
