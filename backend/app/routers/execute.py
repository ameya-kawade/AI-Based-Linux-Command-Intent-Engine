import asyncio
from datetime import datetime
import json
import logging
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.core.models import HistoryItem, IntentAnalysis
from app.core.executor import CommandExecutor
from app.dependencies import get_executor, get_history_manager, get_sandbox_client
from app.services.history_manager import HistoryManager
from app.services.sandbox_client import SandboxClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/execute", tags=["Sandbox Execution"])

class ExecuteRequest(BaseModel):
    command: str
    target: str = "sandbox"
    cwd: Optional[str] = "/tmp"


@router.post("")
@router.post("/")
async def execute_http_endpoint(req: ExecuteRequest):
    """
    HTTP execution endpoint. Reject host execution with 403 Forbidden.
    """
    if req.target == "host":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Host shell execution is permanently disabled for security. All executions must run in the isolated Docker sandbox.",
        )
    return {
        "status": "rejected",
        "detail": "Direct HTTP execution is deprecated. Use WebSocket /api/execute/stream for sandbox execution.",
    }



@router.websocket("/stream")
async def websocket_execution_endpoint(
    websocket: WebSocket,
    executor: CommandExecutor = Depends(get_executor),
    sandbox_client: SandboxClient = Depends(get_sandbox_client),
    history_manager: HistoryManager = Depends(get_history_manager),
):
    """
    WebSocket endpoint for real-time execution streaming.
    SECURITY NOTICE: Host machine execution has been permanently disabled.
    All untrusted shell commands and scripts execute exclusively inside the isolated Docker sandbox.
    """
    await websocket.accept()
    execution_task: Optional[asyncio.Task] = None

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg = json.loads(raw_data)
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid JSON format."})
                continue

            action = msg.get("action")

            if action == "abort":
                if execution_task and not execution_task.done():
                    execution_task.cancel()
                    await websocket.send_json({
                        "type": "aborted",
                        "message": "Sandbox execution task cancelled by user.",
                    })
                continue

            if action == "execute":
                command = (msg.get("command") or "").strip()
                target = msg.get("target", "sandbox")
                analysis_dict = msg.get("analysis")

                parsed_analysis: Optional[IntentAnalysis] = None
                if analysis_dict and isinstance(analysis_dict, dict):
                    try:
                        parsed_analysis = IntentAnalysis(**analysis_dict)
                    except Exception:
                        pass

                if not command:
                    await websocket.send_json({"type": "error", "message": "Command cannot be empty."})
                    continue

                # REJECT HOST EXECUTION REQUESTS
                if target == "host":
                    await websocket.send_json({
                        "type": "error",
                        "message": "Host execution is permanently disabled for security. All executions must run in the isolated Docker sandbox.",
                    })
                    continue

                # CHECK FOR POLICY BLOCKS
                if parsed_analysis:
                    decision = getattr(parsed_analysis, "execution_decision", None)
                    risk_level = getattr(parsed_analysis, "risk_level", None)
                    if decision == "BLOCK" or risk_level == "CRITICAL":
                        # If force confirm flag not present or explicitly blocked
                        if not msg.get("force_confirmed", False) and decision == "BLOCK":
                            await websocket.send_json({
                                "type": "error",
                                "message": "Execution BLOCKED: Command is classified as high-risk or prohibited by security policy.",
                            })
                            continue

                execution_task = asyncio.create_task(
                    _run_sandbox_stream(
                        websocket=websocket,
                        command=command,
                        analysis=parsed_analysis,
                        sandbox_client=sandbox_client,
                        history_manager=history_manager,
                        executor=executor,
                    )
                )

    except WebSocketDisconnect:
        if execution_task and not execution_task.done():
            execution_task.cancel()
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        if execution_task and not execution_task.done():
            execution_task.cancel()


async def _run_sandbox_stream(
    websocket: WebSocket,
    command: str,
    analysis: Optional[IntentAnalysis],
    sandbox_client: SandboxClient,
    history_manager: HistoryManager,
    executor: CommandExecutor,
):
    await websocket.send_json({
        "type": "started",
        "command": command,
        "target": "sandbox",
        "cwd": "/sandbox",
        "prompt_path": "[Docker Sandbox : Alpine]",
    })

    await _send_chunk_safe(websocket, "⚡ Initializing isolated Docker container with Aqua Tracee eBPF engine...\n")

    res = await sandbox_client.analyze_script(command)
    status = res.get("status", "error")
    script_output = res.get("script_output", "")
    tracee_alerts = res.get("tracee_alerts", [])
    meta = res.get("metadata", {})
    exit_code = meta.get("exit_code", 0 if status == "success" else 1)
    duration_ms = meta.get("duration_ms", 0)

    if script_output:
        await _send_chunk_safe(websocket, script_output + "\n")
    if res.get("error"):
        await _send_chunk_safe(websocket, f"\n❌ Sandbox Error: {res.get('error')}\n")

    history_item = HistoryItem(
        id=str(uuid.uuid4()),
        timestamp=datetime.now().isoformat(),
        cwd="[Docker Sandbox]",
        command=command,
        analysis=analysis,
        status=status if status in ("success", "error", "cancelled") else "error",
        output=script_output or str(res.get("error", "")),
        exit_code=exit_code,
        duration_ms=duration_ms,
    )
    history_manager.add_item(history_item)

    await websocket.send_json({
        "type": "finish",
        "command": command,
        "target": "sandbox",
        "output": script_output,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "status": status,
        "tracee_alerts": tracee_alerts,
        "tracee_summary": meta.get("summary", {}),
        "history_item": history_item.model_dump(),
    })


async def _send_chunk_safe(websocket: WebSocket, chunk: str):
    try:
        await websocket.send_json({"type": "chunk", "data": chunk})
    except Exception:
        pass


async def _send_json_safe(websocket: WebSocket, payload: Dict[str, Any]):
    try:
        await websocket.send_json(payload)
    except Exception:
        pass
