import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import analyze, execute, history, manpage, system

app = FastAPI(
    title="Linux Command Intent Engine API",
    description="Multi-Tool Pre-flight Shell Safety, AST Decomposition, and Manpage Intent Interceptor",
    version="1.0.0",
)

# Enable CORS for local Vite dev server and any host
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analyze.router)
app.include_router(system.router)
app.include_router(history.router)
app.include_router(manpage.router)
app.include_router(execute.router)

# Mount frontend build if built
dist_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist_dir.exists() and dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {
            "name": "Linux Command Intent Engine Web API",
            "version": "1.0.0",
            "docs": "/docs",
            "status": "online",
        }
