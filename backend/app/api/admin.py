import os
import asyncio
import hashlib
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func 
from app.db.database import get_db
from app.db.crud import get_stats, get_home_content, set_home_content, get_pipeline_config, upsert_pipeline_bar
from app.db.models import Course, Skill, ProfileNote, Document
from app.cache.redis_client import get_redis
from app.sync.ingestion import ingest_document, list_documents, list_all_files, resolve_doc_text, generate_doc_tags, add_skills_to_inventory
from app.config import get_settings

_jobs: dict = {}

router = APIRouter()
settings = get_settings()

SESSION_TTL = 60 * 60 * 24 * 30
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
async def change_password(req: ChangePasswordRequest, token: str = Depends(require_admin)):
    expected = os.getenv("ADMIN_PASSWORD_HASH", "")
    if _hash_password(req.current_password) != expected:
        raise HTTPException(status_code=401, detail="Current password incorrect")
    new_hash = _hash_password(req.new_password)
    print(f"[admin] New password hash: {new_hash}")
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

@router.post("/sync", dependencies=[Depends(require_admin)])
async def sync_changed():
    """Delta sync: only new or modified Notes_ docs are (re-)ingested."""
    from app.sync.ingestion import sync_changed_documents
    return await sync_changed_documents()


# ── Home content (persisted to Supabase) ─────────────────

class ContentPatch(BaseModel):
    section: str
    field: str
    value: str


@router.patch("/content", dependencies=[Depends(require_admin)])
async def patch_content(req: ContentPatch, db: AsyncSession = Depends(get_db)):
    """Save inline edits — persisted to Supabase."""
    await set_home_content(db, req.section, req.field, req.value)
    return {"ok": True}


@router.get("/content")
async def get_content(db: AsyncSession = Depends(get_db)):
    """Return all saved content overrides from Supabase."""
    return await get_home_content(db)


# ── Pipeline config ──────────────────────────────────────

class PipelineBarUpdate(BaseModel):
    bar_id: str   # "top_bar" | "db_layer" | "bottom_bar"
    label: str
    items: List[str]


@router.get("/pipeline-config")
async def get_pipeline_config_endpoint(db: AsyncSession = Depends(get_db)):
    """Return saved pipeline bar configs."""
    bars = await get_pipeline_config(db)
    return {b.bar_id: {"label": b.label, "items": b.items} for b in bars}


@router.patch("/pipeline-config", dependencies=[Depends(require_admin)])
async def update_pipeline_config(req: PipelineBarUpdate, db: AsyncSession = Depends(get_db)):
    """Upsert a pipeline bar config."""
    await upsert_pipeline_bar(db, req.bar_id, req.label, req.items)
    return {"ok": True}


# ── Course management ─────────────────────────────────────

def _serialize_course(c: Course) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "institution": c.institution or "SMU",
        "year": c.year or 0,
        "summary": c.summary or "",
        "topics": c.topics or [],
        "linked_doc_ids": c.linked_doc_ids or [],
        "is_currently_learning": c.is_currently_learning or False,
        "is_self_explored": c.is_self_explored or False,
        "notes": c.notes or "",
    }


class CourseCreate(BaseModel):
    name: str
    institution: str = "SMU"
    year: int
    summary: str = ""
    topics: List[str] = []
    linked_doc_ids: List[str] = []
    is_currently_learning: bool = False
    is_self_explored: bool = False
    notes: str = ""
    google_doc_id: Optional[str] = None


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None
    year: Optional[int] = None
    summary: Optional[str] = None
    topics: Optional[List[str]] = None
    linked_doc_ids: Optional[List[str]] = None
    is_currently_learning: Optional[bool] = None
    is_self_explored: Optional[bool] = None
    notes: Optional[str] = None


@router.post("/courses", dependencies=[Depends(require_admin)])
async def create_course(req: CourseCreate, db: AsyncSession = Depends(get_db)):
    course = Course(
        name=req.name,
        institution=req.institution,
        year=req.year,
        summary=req.summary,
        topics=req.topics,
        linked_doc_ids=req.linked_doc_ids,
        is_currently_learning=req.is_currently_learning,
        is_self_explored=req.is_self_explored,
        notes=req.notes,
        google_doc_id=req.google_doc_id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _serialize_course(course)


@router.patch("/courses/{course_id}", dependencies=[Depends(require_admin)])
async def update_course(course_id: str, req: CourseUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if req.name is not None:          course.name = req.name
    if req.institution is not None:   course.institution = req.institution
    if req.year is not None:          course.year = req.year
    if req.summary is not None:       course.summary = req.summary
    if req.topics is not None:        course.topics = req.topics
    if req.linked_doc_ids is not None: course.linked_doc_ids = req.linked_doc_ids
    if req.is_currently_learning is not None: course.is_currently_learning = req.is_currently_learning
    if req.is_self_explored is not None:      course.is_self_explored = req.is_self_explored
    if req.notes is not None:         course.notes = req.notes

    await db.commit()
    await db.refresh(course)
    return _serialize_course(course)


@router.delete("/courses/{course_id}", dependencies=[Depends(require_admin)])
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(course)
    await db.commit()
    return {"ok": True}

#  ── Document tags / review queue ─────────────────────────
 
def _serialize_doc(d: Document) -> dict:
    return {
        "id": str(d.id),
        "google_doc_id": d.google_doc_id,
        "title": d.title,
        "chunk_count": d.chunk_count or 0,
        "summary": d.summary or "",
        "skills": d.skills or [],
        "tag_status": d.tag_status or "pending",
        "needs_review": bool(d.needs_review),
        "last_synced_at": d.last_synced_at.isoformat() if d.last_synced_at else None,
    }
 
 
class DocTagsUpdate(BaseModel):
    summary: str
    skills: List[str]
    add_to_inventory: bool = True   # push (new) skills into the Skill table, uncategorised
 
 
@router.get("/documents", dependencies=[Depends(require_admin)])
async def list_admin_documents(db: AsyncSession = Depends(get_db)):
    """All ingested docs with tag state. needs_review first, then pending."""
    result = await db.execute(
        select(Document).order_by(
            Document.needs_review.desc(),
            Document.tag_status,          # 'approved' < 'pending' alphabetically — fine either way
            Document.title,
        )
    )
    return [_serialize_doc(d) for d in result.scalars().all()]
 
 
@router.post("/documents/{google_doc_id}/generate-tags", dependencies=[Depends(require_admin)])
async def generate_tags_for_doc(google_doc_id: str, db: AsyncSession = Depends(get_db)):
    """Generate SUGGESTED summary + skills for one doc. Returns suggestions only —
    nothing is saved until you edit/confirm via PATCH (modify-before-insert)."""
    result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        text = await resolve_doc_text(google_doc_id, doc.title)
        tags = await generate_doc_tags(text, doc.title)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tag generation failed: {e}")
    return {"summary": tags["summary"], "skills": tags["skills"]}
 
 
@router.patch("/documents/{google_doc_id}/tags", dependencies=[Depends(require_admin)])
async def save_doc_tags(google_doc_id: str, req: DocTagsUpdate, db: AsyncSession = Depends(get_db)):
    """Save the (possibly edited) tags, approve, clear needs_review, and
    optionally upsert the skills into the inventory (they land uncategorised —
    drag them onto the board to publish)."""
    result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
 
    doc.summary = req.summary.strip()
    doc.skills = [s.strip() for s in req.skills if s.strip()]
    doc.tag_status = "approved"
    doc.needs_review = False
 
    created = 0
    if req.add_to_inventory:
        created = await add_skills_to_inventory(db, doc.skills)
 
    await db.commit()
    await db.refresh(doc)
    return {"doc": _serialize_doc(doc), "skills_added_to_inventory": created}