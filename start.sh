#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/.." && pwd)"

echo "⚡ Starting Linux Command Intent Engine (Web Edition)..."

# Activate local virtualenv if present
if [ -d "$DIR/.venv" ]; then
    source "$DIR/.venv/bin/activate"
elif [ -d "$DIR/backend/.venv" ]; then
    source "$DIR/backend/.venv/bin/activate"
elif [ -d "$ROOT_DIR/.venv" ]; then
    source "$ROOT_DIR/.venv/bin/activate"
fi

export PYTHONPATH="$DIR/backend:$PYTHONPATH"

# Mode check: if argument is 'dev', start both backend and frontend dev server
if [ "$1" == "dev" ]; then
    echo "🚀 Starting in Development Mode (FastAPI + Vite HMR)..."
    (cd "$DIR/backend" && python run_backend.py) &
    BACKEND_PID=$!
    (cd "$DIR/frontend" && npm run dev) &
    FRONTEND_PID=$!

    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
    wait
else
    echo "🚀 Starting Full Web Application on http://localhost:8000 ..."
    cd "$DIR/backend"
    python run_backend.py
fi
