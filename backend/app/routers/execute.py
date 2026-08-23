import asyncio
from datetime import datetime
import json
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from app.core.models import HistoryItem, IntentAnalysis
from app.core.executor import CommandExecutor
from app.dependencies import get_executor, get_history_manager, get_sandbox_client
from app.services.history_manager import HistoryManager
from app.services.sandbox_client import SandboxClient

router = APIRouter(tags=["Execution Stream"])


@router.websocket("/ws/execute")
async def websocket_execute_endpoint(
    websocket: WebSocket,
    executor: CommandExecutor = Depends(get_executor),
    history_manager: HistoryManager = Depends(get_history_manager),
    sandbox_client: SandboxClient = Depends(get_sandbox_client),
):
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
                    executor.abort_active_process()
                    execution_task.cancel()
                    await websocket.send_json({
                        "type": "aborted",
                        "message": "Process execution aborted by user.",
                    })
                continue

            if action == "execute":
                command = (msg.get("command") or "").strip()
                target = msg.get("target", "host")  # "host" or "sandbox"
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

                # Run either Host subprocess or Docker Sandbox
                if target == "sandbox":
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
                else:
                    execution_task = asyncio.create_task(
                        _run_host_stream(
                            websocket=websocket,
                            command=command,
                            analysis=parsed_analysis,
                            executor=executor,
                            history_manager=history_manager,
                        )
                    )

    except WebSocketDisconnect:
        if execution_task and not execution_task.done():
            executor.abort_active_process()
            execution_task.cancel()
    except Exception:
        if execution_task and not execution_task.done():
            executor.abort_active_process()
            execution_task.cancel()


async def _run_host_stream(
    websocket: WebSocket,
    command: str,
    analysis: Optional[IntentAnalysis],
    executor: CommandExecutor,
    history_manager: HistoryManager,
):
    await websocket.send_json({
        "type": "started",
        "command": command,
        "target": "host",
        "cwd": str(executor.current_cwd),
        "prompt_path": executor.get_prompt_path(),
    })

    output_chunks = []

    def on_chunk(chunk: str):
        output_chunks.append(chunk)
        # Schedule sending to websocket
        asyncio.create_task(_send_chunk_safe(websocket, chunk))

    try:
        full_output, exit_code, duration_ms, status = await executor.execute(
            command,
            on_output_chunk=on_chunk,
        )

        history_item = HistoryItem(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            cwd=executor.get_prompt_path(),
            command=command,
            analysis=analysis,
            status=status,  # type: ignore
            output=full_output,
            exit_code=exit_code,
            duration_ms=duration_ms,
        )
        history_manager.add_item(history_item)

        await websocket.send_json({
            "type": "finish",
            "command": command,
            "target": "host",
            "output": full_output,
            "exit_code": exit_code,
            "duration_ms": duration_ms,
            "status": status,
            "cwd": str(executor.current_cwd),
            "prompt_path": executor.get_prompt_path(),
            "history_item": history_item.model_dump(),
        })

    except asyncio.CancelledError:
        full_out = "".join(output_chunks) + "\n[Execution aborted]\n"
        history_item = HistoryItem(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            cwd=executor.get_prompt_path(),
            command=command,
            analysis=analysis,
            status="cancelled",
            output=full_out,
            exit_code=130,
            duration_ms=0,
        )
        history_manager.add_item(history_item)
        await _send_json_safe(websocket, {
            "type": "finish",
            "command": command,
            "target": "host",
            "output": full_out,
            "exit_code": 130,
            "duration_ms": 0,
            "status": "cancelled",
            "cwd": str(executor.current_cwd),
            "prompt_path": executor.get_prompt_path(),
            "history_item": history_item.model_dump(),
        })
    except Exception as e:
        err_msg = f"Execution error: {str(e)}\n"
        await _send_json_safe(websocket, {
            "type": "finish",
            "command": command,
            "target": "host",
            "output": err_msg,
            "exit_code": 1,
            "duration_ms": 0,
            "status": "error",
            "cwd": str(executor.current_cwd),
            "prompt_path": executor.get_prompt_path(),
        })


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
        status=status if status in ("success", "error", "cancelled") else "error",  # type: ignore
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
