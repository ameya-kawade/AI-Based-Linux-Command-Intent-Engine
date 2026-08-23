from typing import Any, Dict, Optional
import httpx
from app.config import settings


class SandboxClient:
    """HTTP Client for interacting with the Docker + Tracee eBPF Script Sandbox API."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.SANDBOX_API_URL).rstrip("/")

    async def get_health(self) -> Dict[str, Any]:
        """Checks if the sandbox server and Docker daemon are running."""
        try:
            timeout_cfg = httpx.Timeout(2.0, connect=1.0)
            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                res = await client.get(f"{self.base_url}/api/health")
                if res.status_code == 200:
                    data = res.json()
                    return {
                        "available": True,
                        "docker_available": data.get("docker", {}).get("available", False),
                        "details": data,
                    }
        except Exception:
            pass
        return {"available": False, "docker_available": False, "details": None}

    async def analyze_script(self, script: str) -> Dict[str, Any]:
        """Submits script to the isolated Docker sandbox with Tracee eBPF monitoring."""
        try:
            timeout_cfg = httpx.Timeout(15.0, connect=1.5)
            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                res = await client.post(
                    f"{self.base_url}/api/analyze",
                    json={"script": script},
                    headers={"Content-Type": "application/json"},
                )
                if res.status_code in (200, 400, 500):
                    return res.json()
                return {
                    "status": "error",
                    "error": f"Sandbox HTTP status {res.status_code}: {res.text}",
                    "script_output": "",
                    "tracee_alerts": [],
                    "metadata": {"exit_code": 1, "timed_out": False, "duration_ms": 0},
                }
        except (httpx.ConnectError, httpx.ConnectTimeout):
            return {
                "status": "error",
                "error": f"Cannot connect to Sandbox daemon at {self.base_url}. Make sure script_executor is running on port 3000.",
                "script_output": "",
                "tracee_alerts": [],
                "metadata": {"exit_code": 1, "timed_out": False, "duration_ms": 0},
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"Sandbox execution error: {str(e)}",
                "script_output": "",
                "tracee_alerts": [],
                "metadata": {"exit_code": 1, "timed_out": False, "duration_ms": 0},
            }
