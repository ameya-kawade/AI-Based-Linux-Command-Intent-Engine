import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend, web root, or workspace root if present
_current_dir = Path(__file__).resolve().parent
_backend_dir = _current_dir.parent
_web_dir = _backend_dir.parent
_root_dir = _web_dir.parent

for env_candidate in [
    _backend_dir / ".env",
    _web_dir / ".env",
    _root_dir / ".env",
]:
    if env_candidate.exists():
        load_dotenv(env_candidate)

load_dotenv()

class Settings:
    HOST: str = os.getenv("WEB_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("WEB_PORT", "8000"))
    CORS_ORIGINS: list[str] = ["*"]
    
    # Sandbox service endpoint
    SANDBOX_API_URL: str = os.getenv("SANDBOX_API_URL", "http://localhost:3000")
    
    # AI configuration
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "")
    AI_MODEL: str = os.getenv("AI_MODEL", "")
    
    # Groq Cloud configuration
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "groq/compound-mini")
    
    # Other AI providers
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

settings = Settings()
