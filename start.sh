#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/.." && pwd)"

echo "⚡ Starting Linux Command Intent Engine (Web Edition)..."

# 1. Activate Python virtual environment if present
if [ -d "$DIR/.venv" ]; then
    source "$DIR/.venv/bin/activate"
elif [ -d "$DIR/backend/.venv" ]; then
    source "$DIR/backend/.venv/bin/activate"
elif [ -d "$ROOT_DIR/.venv" ]; then
    source "$ROOT_DIR/.venv/bin/activate"
fi

export PYTHONPATH="$DIR/backend:$PYTHONPATH"

# 2. Check Node dependencies if missing
if [ -d "$DIR/frontend" ] && [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    (cd "$DIR/frontend" && npm install)
fi

if [ -d "$DIR/script_executor" ] && [ ! -d "$DIR/script_executor/node_modules" ]; then
    echo "📦 Installing script_executor dependencies..."
    (cd "$DIR/script_executor" && npm install)
fi

# 3. Docker status check for sandbox service
DOCKER_STATUS="Offline"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER_STATUS="Connected (eBPF Tracee Sandboxing Ready)"
else
    DOCKER_STATUS="Offline (Sandbox API will run with fallback handling)"
fi

# Mode routing
if [ "$1" == "test" ]; then
    echo "🧪 Running full test suite..."
    echo "--- [1/2] Backend Pytest ---"
    (cd "$DIR/backend" && pytest -v)
    if [ -d "$DIR/script_executor" ]; then
        echo "--- [2/2] Script Executor Jest ---"
        (cd "$DIR/script_executor" && npm test)
    fi
    exit 0

elif [ "$1" == "build" ]; then
    echo "🔨 Building frontend production bundle..."
    (cd "$DIR/frontend" && npm run build)
    echo "✅ Build complete in frontend/dist"
    exit 0

elif [ "$1" == "dev" ]; then
    echo "🚀 Mode: DEVELOPMENT (FastAPI + Vite HMR + Sandbox Executor)"
    echo "   • 🌐 Frontend UI:     http://localhost:5173"
    echo "   • ⚡ Backend API:     http://localhost:8000"
    echo "   • 🛡️  Script Sandbox:  http://localhost:3000 [Docker: $DOCKER_STATUS]"
    echo ""

    # Start backend
    (cd "$DIR/backend" && python run_backend.py) &
    BACKEND_PID=$!

    # Start frontend Vite dev server
    (cd "$DIR/frontend" && npm run dev) &
    FRONTEND_PID=$!

    # Start script_executor service if available
    EXECUTOR_PID=""
    if [ -d "$DIR/script_executor" ]; then
        (cd "$DIR/script_executor" && npm start) &
        EXECUTOR_PID=$!
    fi

    cleanup() {
        echo ""
        echo "🛑 Shutting down all services..."
        kill $BACKEND_PID $FRONTEND_PID $EXECUTOR_PID 2>/dev/null || true
        wait $BACKEND_PID $FRONTEND_PID $EXECUTOR_PID 2>/dev/null || true
    }

    trap cleanup EXIT INT TERM
    wait

else
    echo "🚀 Mode: PRODUCTION / UNIFIED (FastAPI Serving SPA + Sandbox Executor)"
    
    # Ensure frontend is built before serving via FastAPI
    if [ ! -d "$DIR/frontend/dist" ]; then
        echo "🔨 Building frontend production bundle for static hosting..."
        (cd "$DIR/frontend" && npm run build)
    fi

    # Start script_executor service in background if present
    EXECUTOR_PID=""
    if [ -d "$DIR/script_executor" ]; then
        echo "🛡️  Starting Tracee eBPF Sandbox Executor on port 3000 [Docker: $DOCKER_STATUS]..."
        (cd "$DIR/script_executor" && npm start) &
        EXECUTOR_PID=$!
    fi

    echo "🌐 Unified Web Application starting at: http://localhost:8000"
    echo "   • API Docs: http://localhost:8000/docs"
    echo ""

    cleanup() {
        echo ""
        echo "🛑 Shutting down all services..."
        if [ -n "$EXECUTOR_PID" ]; then
            kill $EXECUTOR_PID 2>/dev/null || true
        fi
        if [ -n "$BACKEND_PID" ]; then
            kill $BACKEND_PID 2>/dev/null || true
        fi
    }

    trap cleanup EXIT INT TERM

    (cd "$DIR/backend" && python run_backend.py) &
    BACKEND_PID=$!

    wait
fi
