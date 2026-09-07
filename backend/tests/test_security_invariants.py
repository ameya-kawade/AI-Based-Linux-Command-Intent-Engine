"""
Security Invariants Test Suite

Verifies the 10 core security invariants of the Linux Command Intent Engine.
These tests must ALWAYS pass — they are the regression gate for all security changes.
"""
import json
import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 1: Host execution is permanently disabled in the backend executor
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_1_host_execution_disabled():
    """Executor.run_on_host() must raise PermissionError unconditionally."""
    from app.core.executor import CommandExecutor
    executor = CommandExecutor()
    with pytest.raises(PermissionError, match="[Hh]ost"):
        import asyncio
        asyncio.run(executor.run_on_host("echo hi", "/tmp"))


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 2: Execute router rejects target='host' with 403
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_2_execute_router_blocks_host(test_client):
    """POST /api/execute with target='host' must return 403 Forbidden."""
    resp = test_client.post(
        "/api/execute",
        json={"command": "echo test", "target": "host", "cwd": "/tmp"},
    )
    assert resp.status_code == 403, (
        f"Expected 403 Forbidden for host target, got {resp.status_code}"
    )
    body = resp.json()
    assert "host" in body.get("detail", "").lower() or "forbidden" in body.get("detail", "").lower()


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 3: Execution decision is BLOCK for CRITICAL risk commands
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_invariant_3_critical_risk_blocks_execution():
    """CRITICAL risk analysis must always produce execution_decision=BLOCK."""
    from app.core.pipeline.coordinator import PipelineCoordinator
    coord = PipelineCoordinator()
    result = await coord.process("rm -rf / --no-preserve-root")
    assert result.risk_level == "CRITICAL", f"Expected CRITICAL, got {result.risk_level}"
    assert result.execution_decision == "BLOCK", (
        f"Expected BLOCK for CRITICAL risk, got {result.execution_decision}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 4: SAFE commands receive ALLOW decision (not over-blocked)
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_invariant_4_safe_commands_get_allow():
    """Benign read-only commands must produce execution_decision=ALLOW."""
    from app.core.pipeline.coordinator import PipelineCoordinator
    coord = PipelineCoordinator()
    result = await coord.process("ls -la /tmp")
    assert result.risk_level in ("SAFE",), f"Expected SAFE, got {result.risk_level}"
    assert result.execution_decision == "ALLOW", (
        f"Expected ALLOW for SAFE command, got {result.execution_decision}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 5: Original command is preserved after normalization
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_invariant_5_original_command_preserved():
    """IntentAnalysis.command must equal the original input, not normalized form."""
    from app.core.pipeline.coordinator import PipelineCoordinator
    original = "echo  hello"  # double space — will be normalized to single space
    coord = PipelineCoordinator()
    result = await coord.process(original)
    assert result.command == original, (
        f"Expected command='{original}', got '{result.command}'"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 6: Docker sandbox config drops ALL capabilities
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_6_sandbox_drops_all_capabilities():
    """Docker service config must set CapDrop=['ALL'] and no CapAdd."""
    import subprocess, json as json_lib
    result = subprocess.run(
        ["node", "-e",
         "const c=require('./src/config/index.js'); console.log(JSON.stringify(c.sandbox || c.default || c))"],
        capture_output=True, text=True,
        cwd="/home/ameya/projects/linux_command_intent_engine/web/script_executor"
    )
    # If can't run node, at least check the source file text
    src_path = "/home/ameya/projects/linux_command_intent_engine/web/script_executor/src/services/dockerService.js"
    with open(src_path) as f:
        src = f.read()
    assert "CapDrop" in src and "'ALL'" in src or '"ALL"' in src, (
        "dockerService.js must specify CapDrop: ['ALL']"
    )
    assert "CapAdd" not in src or src.count("CapAdd") == 0, (
        "dockerService.js must not have CapAdd (all capabilities must be dropped)"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 7: Non-root user enforced in sandbox
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_7_sandbox_non_root_user():
    """Docker service config must set User to a non-root UID (10001)."""
    src_path = "/home/ameya/projects/linux_command_intent_engine/web/script_executor/src/services/dockerService.js"
    with open(src_path) as f:
        src = f.read()
    assert "10001" in src, (
        "dockerService.js must run containers as non-root user 10001"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 8: ReadonlyRootfs enforced in sandbox
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_8_sandbox_readonly_rootfs():
    """Docker service config must set ReadonlyRootfs=true."""
    src_path = "/home/ameya/projects/linux_command_intent_engine/web/script_executor/src/services/dockerService.js"
    with open(src_path) as f:
        src = f.read()
    assert "ReadonlyRootfs" in src and ("true" in src or "True" in src), (
        "dockerService.js must set ReadonlyRootfs to true"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 9: Network isolation enforced by default (NetworkMode: 'none')
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_9_sandbox_network_none():
    """Default sandbox network mode must be 'none' (complete isolation)."""
    config_path = "/home/ameya/projects/linux_command_intent_engine/web/script_executor/src/config/index.js"
    with open(config_path) as f:
        src = f.read()
    assert "none" in src and ("networkMode" in src or "NetworkMode" in src), (
        "script_executor config must default networkMode to 'none'"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Invariant 10: ExplainShell tool does NOT use 'or True' in is_available()
# ─────────────────────────────────────────────────────────────────────────────
def test_invariant_10_explainshell_availability_not_forced():
    """ExplainShell is_available() must not be forced to True with 'or True'."""
    tool_path = "/home/ameya/projects/linux_command_intent_engine/web/backend/app/core/pipeline/explainshell_tool.py"
    with open(tool_path) as f:
        src = f.read()
    assert "or True" not in src, (
        "explainshell_tool.py must not have 'or True' in is_available() — this masks unavailability"
    )
