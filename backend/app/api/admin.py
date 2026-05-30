import os
import asyncio
import hashlib
import secrets
import json
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.crud import get_stats
from app.db.models import Course
from app.cache.redis_client import get_redis
from app.sync.ingestion import ingest_document, list_documents
from app.config import get_settings

_jobs: dict = {}  # in-process job tracker

router = APIRouter()
settings = get_settings()

ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
SESSION_TTL = 60 * 60 * 24 * 30  # 30 days — survives docker restarts
ADMIN_COOKIE = "admin_session"


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def require_admin(request: Request):
    r = await get_redis()
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    valid = await r.get(f"admin_session:{token}")
    if not valid:
        raise HTTPException(status_code=401, detail="Session expired")
    return token


# ── Auth ────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(req: LoginRequest, response: Response):
    expected = os.getenv("ADMIN_PASSWORD_HASH", "")
    if not expected or _hash_password(req.password) != expected:
        raise HTTPException(status_code=401, detail="Invalid password")

    token = secrets.token_hex(32)
    r = await get_redis()
    await r.setex(f"admin_session:{token}", SESSION_TTL, "1")

    response.set_cookie(
        key=ADMIN_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.environment != "development",
        max_age=SESSION_TTL,
    )
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(ADMIN_COOKIE)
    if token:
        r = await get_redis()
        await r.delete(f"admin_session:{token}")
    response.delete_cookie(ADMIN_COOKIE)
    return {"ok": True}


@router.get("/me")
async def me(token: str = Depends(require_admin)):
    return {"authenticated": True}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    token: str = Depends(require_admin),
):
    expected = os.getenv("ADMIN_PASSWORD_HASH", "")
    if _hash_password(req.current_password) != expected:
        raise HTTPException(status_code=401, detail="Current password incorrect")

    # Print new hash — admin copies this into .env and restarts
    new_hash = _hash_password(req.new_password)
    print(f"[admin] New password hash: {new_hash}")
    print(f"[admin] Set ADMIN_PASSWORD_HASH={new_hash} in your .env and restart")
    return {
        "message": "Copy this hash into ADMIN_PASSWORD_HASH in your .env and restart the backend",
        "new_hash": new_hash,
    }


# ── Stats ────────────────────────────────────────────

@router.get("/stats", dependencies=[Depends(require_admin)])
async def admin_stats(db: AsyncSession = Depends(get_db)):
    stats = await get_stats(db)
    return {
        "total_queries": stats["total_queries"],
        "total_visitors": stats["total_visitors"],
        "total_docs": stats["total_docs"],
        "role_breakdown": stats["role_breakdown"],
        "recent_queries": [
            {
                "question": q.question,
                "answer": q.answer[:200] + "..." if len(q.answer) > 200 else q.answer,
                "session_id": q.session_id,
                "feedback": q.feedback,
                "cache_hit": q.cache_hit,
                "response_ms": q.response_ms,
                "created_at": q.created_at.isoformat(),
            }
            for q in stats["recent_queries"]
        ],
    }


# ── Ingestion controls ────────────────────────────────

async def _run_ingest_job(job_id: str):
    try:
        docs = await list_documents()
        _jobs[job_id]["total"] = len(docs)
        for doc in docs:
            _jobs[job_id]["current"] = doc["name"]
            result = await ingest_document(doc["id"], doc["name"])
            _jobs[job_id]["done"] += 1
            _jobs[job_id]["results"].append({"title": result["title"], "chunks": result["chunk_count"], "ms": result["elapsed_ms"]})
        _jobs[job_id]["status"] = "done"
    except Exception as e:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(e)


@router.post("/ingest/all", dependencies=[Depends(require_admin)])
async def ingest_all():
    job_id = secrets.token_hex(8)
    _jobs[job_id] = {"status": "running", "done": 0, "total": 0, "current": "", "results": [], "error": None}
    asyncio.create_task(_run_ingest_job(job_id))
    return {"job_id": job_id}


@router.get("/ingest/status/{job_id}", dependencies=[Depends(require_admin)])
async def ingest_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/ingest/doc/{doc_id}", dependencies=[Depends(require_admin)])
async def ingest_one(doc_id: str):
    try:
        result = await ingest_document(doc_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Content editing ──────────────────────────────────────

class ContentPatch(BaseModel):
    section: str
    field: str
    value: str


@router.patch("/content", dependencies=[Depends(require_admin)])
async def patch_content(req: ContentPatch):
    """
    Save inline edits from the home page edit mode.
    Stores in Redis for now — replace with Supabase for persistence across restarts.
    """
    r = await get_redis()
    key = f"content:{req.section}:{req.field}"
    await r.set(key, req.value)
    return {"ok": True}


@router.get("/content")
async def get_content():
    """Return all saved content overrides."""
    r = await get_redis()
    keys = await r.keys("content:*")
    result = {}
    for key in keys:
        _, section, field = key.split(":", 2)
        val = await r.get(key)
        if section not in result:
            result[section] = {}
        result[section][field] = val
    return result


# ── Course management ─────────────────────────────────────

class CourseCreate(BaseModel):
    name: str
    institution: str = "SMU"
    year: int
    summary: str = ""
    topics: List[str] = []
    google_doc_id: Optional[str] = None


@router.post("/courses", dependencies=[Depends(require_admin)])
async def create_course(req: CourseCreate, db: AsyncSession = Depends(get_db)):
    course = Course(
        name=req.name,
        institution=req.institution,
        year=req.year,
        summary=req.summary,
        topics=req.topics,
        google_doc_id=req.google_doc_id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return {
        "id": str(course.id),
        "name": course.name,
        "institution": course.institution,
        "year": course.year,
        "summary": course.summary,
        "topics": course.topics,
    }


@router.delete("/courses/{course_id}", dependencies=[Depends(require_admin)])
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(course)
    await db.commit()
    return {"ok": True}