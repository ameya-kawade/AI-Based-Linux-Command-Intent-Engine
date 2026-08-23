import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.man7_scraper import get_man7_engine


def test_man7_fetch_awk_manpage():
    engine = get_man7_engine()
    data = engine.fetch_manpage("awk")
    assert data is not None
    assert data["command"] == "awk"
    assert "https://man7.org/linux/man-pages/man1/awk.1p.html" in data["url"]
    assert "pattern scanning" in data["synopsis"].lower() or "awk" in data["name"].lower()
    assert "-F" in data["options"]
    assert "-v" in data["options"]


def test_man7_fetch_ls_manpage():
    engine = get_man7_engine()
    data = engine.fetch_manpage("ls")
    assert data is not None
    assert data["command"] == "ls"
    assert "https://man7.org/linux/man-pages/man1/ls.1.html" in data["url"] or "1p" in data["url"]
    assert "list directory" in data["synopsis"].lower()
    assert "-a" in data["options"]
    assert "-l" in data["options"]


def test_man7_explain_awk_command():
    engine = get_man7_engine()
    explanation = engine.explain("awk -F: '{print $1}' /etc/passwd")
    assert explanation is not None
    assert explanation.command == "awk"
    assert explanation.manpage_url == "https://man7.org/linux/man-pages/man1/awk.1p.html"
    assert len(explanation.used_flags) >= 1
    
    flag_f = next((f for f in explanation.used_flags if f.flag == "-F"), None)
    assert flag_f is not None
    assert flag_f.argument_value == ":"
    assert "field separator" in flag_f.summary.lower()


def test_man7_explain_tar_command():
    engine = get_man7_engine()
    explanation = engine.explain("tar -czvf backup.tar.gz /var/log")
    assert explanation is not None
    assert explanation.command == "tar"
    assert "man7.org" in explanation.manpage_source
    assert len(explanation.used_flags) >= 1
    assert "backup.tar.gz" in explanation.positional_args or "/var/log" in explanation.positional_args


def test_man7_cache_persistence():
    engine = get_man7_engine()
    # First call caches it
    d1 = engine.fetch_manpage("grep")
    assert d1 is not None

    # Second call retrieves from cache
    d2 = engine._get_from_cache("grep")
    assert d2 is not None
    assert d2["command"] == "grep"
    assert d2["url"] == d1["url"]
    assert len(d2["options"]) == len(d1["options"])


@pytest.mark.asyncio
async def test_api_manpage_endpoint_awk():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/manpage/awk -F: '{print $1}' /etc/passwd")
        assert response.status_code == 200
        data = response.json()
        assert data["command"] == "awk"
        assert data["manpage_url"] == "https://man7.org/linux/man-pages/man1/awk.1p.html"
        assert len(data["used_flags"]) >= 1


@pytest.mark.asyncio
async def test_pipeline_explainshell_man7_integration():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/analyze",
            json={"command": "awk -F, '{print $2}' data.csv", "provider": "offline"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["command"] == "awk -F, '{print $2}' data.csv"
        assert data["manpage_explanation"] is not None
        assert data["manpage_explanation"]["command"] == "awk"
        assert data["manpage_explanation"]["manpage_url"] == "https://man7.org/linux/man-pages/man1/awk.1p.html"
        assert any(f["flag"] == "-F" for f in data["manpage_explanation"]["used_flags"])
