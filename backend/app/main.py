# backend/app/main.py
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import get_settings
from app.db.database import init_db
from app.api import query, admin, health, courses, planning
from app.sync.ingestion import auto_sync_loop

settings = get_settings()

ALLOWED_ORIGINS = (
    ["http://localhost:3000"]
    if settings.environment == "development"
    else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
)

class _HealthFilter(logging.Filter):
    def filter(self, record):
        return "/api/admin/ingest/active" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_HealthFilter())

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        print("[startup] Database tables ready")
    except Exception as e:
        print(f"[startup] DB init failed: {e} — continuing anyway")

    sync_task = None
    if settings.auto_sync_interval_minutes > 0:
        sync_task = asyncio.create_task(auto_sync_loop(settings.auto_sync_interval_minutes))
        print(f"[startup] Auto-sync every {settings.auto_sync_interval_minutes} min")
    yield
    if sync_task:
        sync_task.cancel()


app = FastAPI(title="Portfolio RAG API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(query.router, prefix="/api", tags=["query"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(courses.router, prefix="/api", tags=["courses"])
app.include_router(planning.router, prefix="/api/planning", tags=["planning"])