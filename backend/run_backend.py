import sys
from pathlib import Path
import uvicorn

# Ensure backend root is on sys.path
backend_path = Path(__file__).resolve().parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
