import os
import sys
from pathlib import Path

# Add backend root to sys.path
backend_path = Path(__file__).resolve().parents[1]
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

os.environ["LLM_PROVIDER"] = "offline"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def test_client():
    """FastAPI test client for API-level integration tests."""
    from app.main import app
    with TestClient(app) as client:
        yield client
