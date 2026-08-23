from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.models import IntentAnalysis
from app.core.analyzer import AnalyzerService
from app.core.pipeline.script_tool import ScriptIntentAnalyzerTool
from app.dependencies import get_analyzer, get_executor

router = APIRouter(prefix="/api", tags=["Analysis"])


class AnalyzeRequest(BaseModel):
    command: str = Field(..., description="Shell command string to inspect and analyze")
    cwd: Optional[str] = Field(default=None, description="Optional working directory context")
    provider: Optional[str] = Field(default=None, description="Optional runtime AI provider override ('groq', 'ollama', etc.)")
    model: Optional[str] = Field(default=None, description="Optional AI model override")
    api_key: Optional[str] = Field(default=None, description="Optional API key override for cloud providers")
    script_content: Optional[str] = Field(default=None, description="Optional bash/shell script source code to analyze in eBPF Tracee sandbox")
    script_name: Optional[str] = Field(default=None, description="Optional script file name (e.g. 'deploy.sh')")


class ScriptDetectionRequest(BaseModel):
    command: str = Field(..., description="Command string to inspect for script references")


class ScriptDetectionResponse(BaseModel):
    has_script: bool = Field(..., description="Whether a local script invocation was detected")
    script_name: Optional[str] = Field(default=None, description="Extracted script filename")


@router.post("/analyze/detect-script", response_model=ScriptDetectionResponse)
async def detect_script_reference(req: ScriptDetectionRequest):
    """Detects whether a command line executes a local bash/shell script."""
    detector = ScriptIntentAnalyzerTool()
    script_name = detector.detect_script_reference(req.command)
    return ScriptDetectionResponse(
        has_script=script_name is not None,
        script_name=script_name,
    )


@router.post("/analyze", response_model=IntentAnalysis)
async def analyze_command(
    req: AnalyzeRequest,
    analyzer: AnalyzerService = Depends(get_analyzer),
    executor = Depends(get_executor),
):
    """
    Runs full multi-tool pre-flight intent and security analysis on a shell command.
    Uses SafeCmd AST allowlists, Explainshell manpage flag parsing, CmdCaliper semantic vectors,
    Rule-based Heuristics, Aqua Tracee eBPF Script Sandbox, and AI reasoning (Groq / Ollama).
    """
    command = req.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Command string cannot be empty.")

    target_cwd = str(req.cwd or executor.current_cwd)
    analysis = await analyzer.analyze(
        command,
        cwd=target_cwd,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        script_content=req.script_content,
        script_name=req.script_name,
    )
    return analysis
