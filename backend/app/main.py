import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.db.database import init_db
from app.api import query, webhook, admin, health, courses

settings = get_settings()

ALLOWED_ORIGINS = (
    ["*"] if settings.environment == "development"
    else [
        "http://localhost:3000",
        "https://your-vercel-app.vercel.app",
    ]
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        print("[startup] Database tables ready")
    except Exception as e:
        print(f"[startup] DB init failed: {e} — continuing anyway")
    yield


app = FastAPI(title="Portfolio RAG API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOWED_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(query.router, prefix="/api", tags=["query"])
app.include_router(webhook.router, prefix="/api", tags=["webhook"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(courses.router, prefix="/api", tags=["courses"])