import os
import sys
from pathlib import Path

# Add backend root to sys.path
backend_path = Path(__file__).resolve().parents[1]
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

os.environ["LLM_PROVIDER"] = "offline"
