# backend/app/api/admin.py
import os
import uuid
import asyncio
import hashlib
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.database import get_db
from app.db.crud import get_stats
from app.db.models import Course, Skill, ProfileNote, Document
from app.cache.redis_client import get_redis
from app.sync.ingestion import (
    ingest_document,
    list_all_files,
    resolve_doc_text,
    generate_doc_tags,
    resolve_skills,
    generate_course_summary,
    sync_changed_documents,
)
from app.config import get_settings

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


# ── Skills (curated inventory → public diagram) ──────────

def _serialize_skill(s: Skill) -> dict:
    return {"id": str(s.id), "name": s.name, "category": s.category,
            "achieved": s.achieved, "sort_order": s.sort_order}


class SkillCreate(BaseModel):
    name: str
    category: Optional[str] = None
    achieved: bool = True
    sort_order: int = 0


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None   # "" clears → off-diagram
    achieved: Optional[bool] = None
    sort_order: Optional[int] = None


@router.get("/skills", dependencies=[Depends(require_admin)])
async def list_skills(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Skill).order_by(Skill.sort_order, Skill.name))
    return [_serialize_skill(s) for s in result.scalars().all()]


@router.post("/skills", dependencies=[Depends(require_admin)])
async def create_skill(req: SkillCreate, db: AsyncSession = Depends(get_db)):
    name = req.name.strip()
    dupe = await db.execute(select(Skill).where(func.lower(Skill.name) == name.lower()))
    if dupe.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Skill already exists")
    skill = Skill(name=name, category=req.category or None,
                  achieved=req.achieved, sort_order=req.sort_order)
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return _serialize_skill(skill)


@router.patch("/skills/{skill_id}", dependencies=[Depends(require_admin)])
async def update_skill(skill_id: str, req: SkillUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if req.name is not None:       skill.name = req.name.strip()
    if req.category is not None:   skill.category = req.category or None
    if req.achieved is not None:   skill.achieved = req.achieved
    if req.sort_order is not None: skill.sort_order = req.sort_order
    await db.commit()
    await db.refresh(skill)
    return _serialize_skill(skill)


@router.delete("/skills/{skill_id}", dependencies=[Depends(require_admin)])
async def delete_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    """Cascades: the skill disappears from every document via document_skills."""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    await db.delete(skill)
    await db.commit()
    return {"ok": True}


# ── Profile notes (living context for planning) ──────────

def _serialize_note(n: ProfileNote) -> dict:
    return {"id": str(n.id), "category": n.category, "content": n.content,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "updated_at": n.updated_at.isoformat() if n.updated_at else None}


class ProfileNoteCreate(BaseModel):
    category: str = "misc"
    content: str


class ProfileNoteUpdate(BaseModel):
    category: Optional[str] = None
    content: Optional[str] = None


@router.get("/profile-notes", dependencies=[Depends(require_admin)])
async def list_profile_notes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProfileNote).order_by(ProfileNote.category, ProfileNote.created_at))
    return [_serialize_note(n) for n in result.scalars().all()]


@router.post("/profile-notes", dependencies=[Depends(require_admin)])
async def create_profile_note(req: ProfileNoteCreate, db: AsyncSession = Depends(get_db)):
    note = ProfileNote(category=req.category, content=req.content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _serialize_note(note)


@router.patch("/profile-notes/{note_id}", dependencies=[Depends(require_admin)])
async def update_profile_note(note_id: str, req: ProfileNoteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProfileNote).where(ProfileNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if req.category is not None: note.category = req.category
    if req.content is not None:  note.content = req.content
    await db.commit()
    await db.refresh(note)
    return _serialize_note(note)


@router.delete("/profile-notes/{note_id}", dependencies=[Depends(require_admin)])
async def delete_profile_note(note_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProfileNote).where(ProfileNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
    return {"ok": True}


# ── Documents (edited from the homepage in Curate mode) ──

class DocUpdate(BaseModel):
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    course_id: Optional[str] = None   # "" clears the folder


@router.post("/documents/{google_doc_id}/generate-tags", dependencies=[Depends(require_admin)])
async def generate_tags_for_doc(google_doc_id: str, db: AsyncSession = Depends(get_db)):
    """SUGGESTED summary + skills for one doc. Nothing saved until PATCH."""
    result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        text, _parse_status = await resolve_doc_text(google_doc_id, doc.title)
        tags = await generate_doc_tags(text, doc.title)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tag generation failed: {e}")
    return {"summary": tags["summary"], "skills": tags["skills"]}


@router.patch("/documents/{google_doc_id}", dependencies=[Depends(require_admin)])
async def update_document(google_doc_id: str, req: DocUpdate, db: AsyncSession = Depends(get_db)):
    """Save edited summary/skills (approves + clears review flag) and/or move
    the doc between folders. Skill names resolve through the inventory —
    unknown names are created in the off-diagram pool automatically."""
    result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if req.summary is not None:
        doc.summary = req.summary.strip()
    if req.skills is not None:
        doc.skills = await resolve_skills(db, req.skills)
    if req.summary is not None or req.skills is not None:
        doc.tag_status = "approved"
        doc.needs_review = False
    if req.course_id is not None:
        doc.course_id = uuid.UUID(req.course_id) if req.course_id else None

    # Serialize BEFORE commit — commit expires attributes, and touching the
    # skills relationship afterwards would lazy-load → MissingGreenlet.
    payload = {
        "google_doc_id": doc.google_doc_id,
        "summary": doc.summary or "",
        "skills": [s.name for s in doc.skills],
        "tag_status": doc.tag_status,
        "needs_review": bool(doc.needs_review),
        "course_id": str(doc.course_id) if doc.course_id else None,
    }
    await db.commit()
    return payload


# ── Courses (folders) ────────────────────────────────────

class CourseCreate(BaseModel):
    name: str


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    summary: Optional[str] = None
    is_currently_learning: Optional[bool] = None
    notes: Optional[str] = None


def _serialize_course(c: Course) -> dict:
    return {"id": str(c.id), "name": c.name, "summary": c.summary or "",
            "is_currently_learning": bool(c.is_currently_learning),
            "notes": c.notes or ""}


@router.post("/courses", dependencies=[Depends(require_admin)])
async def create_course(req: CourseCreate, db: AsyncSession = Depends(get_db)):
    course = Course(name=req.name.strip() or "Untitled")
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
    if req.name is not None:    course.name = req.name.strip() or course.name
    if req.summary is not None: course.summary = req.summary.strip()
    if req.is_currently_learning is not None: course.is_currently_learning = req.is_currently_learning
    if req.notes is not None:   course.notes = req.notes.strip()
    await db.commit()
    await db.refresh(course)
    return _serialize_course(course)


@router.delete("/courses/{course_id}", dependencies=[Depends(require_admin)])
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db)):
    """Docs in the folder become folder-less (course_id → NULL), not deleted."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(course)
    await db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/generate-summary", dependencies=[Depends(require_admin)])
async def course_summary_draft(course_id: str, db: AsyncSession = Depends(get_db)):
    """Draft a folder summary from its docs' summaries. Returns a draft only."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    docs = (await db.execute(
        select(Document).where(Document.course_id == course.id))).scalars().all()
    summaries = [d.summary for d in docs if d.summary]
    if not summaries:
        raise HTTPException(status_code=400, detail="No doc summaries in this folder yet")
    try:
        draft = await generate_course_summary(course.name, summaries)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Summary generation failed: {e}")
    return {"summary": draft}


# ── Ingestion (backend batch job — survives tab close) ───

GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
INGEST_PACING_SECONDS = 8   # keeps parse+tag traffic under Gemini free-tier RPM

_batch_job: dict | None = None   # single job at a time; in-memory by design —
                                 # a backend restart kills the task AND the state
                                 # together, so reported state matches reality.


class BatchDoc(BaseModel):
    id: str
    name: Optional[str] = None


class BatchRequest(BaseModel):
    docs: List[BatchDoc]


async def _run_batch(docs: List[BatchDoc]):
    global _batch_job
    try:
        for d in docs:
            if _batch_job.get("cancel"):
                _batch_job["status"] = "cancelled"
                return
            _batch_job["current"] = d.name or d.id
            r = await ingest_document(d.id, d.name)
            _batch_job["done"] += 1
            _batch_job["results"].append({
                "title": r["title"], "chunks": r["chunk_count"],
                "ms": r["elapsed_ms"], "parse_status": r["parse_status"],
            })
            await asyncio.sleep(INGEST_PACING_SECONDS)
        _batch_job["status"] = "done"
        _batch_job["current"] = ""
    except Exception as e:
        _batch_job["status"] = "error"
        _batch_job["error"] = str(e)


@router.post("/ingest/batch", dependencies=[Depends(require_admin)])
async def ingest_batch(req: BatchRequest):
    """Ingest the picker's selection server-side. One job at a time."""
    global _batch_job
    if _batch_job and _batch_job["status"] == "running":
        raise HTTPException(status_code=409, detail="A batch is already running")
    if not req.docs:
        raise HTTPException(status_code=400, detail="Empty selection")
    _batch_job = {"status": "running", "done": 0, "total": len(req.docs),
                  "current": "", "results": [], "error": None, "cancel": False}
    asyncio.create_task(_run_batch(req.docs))
    return {"ok": True, "total": len(req.docs)}


@router.get("/ingest/active", dependencies=[Depends(require_admin)])
async def ingest_active():
    """Current/last batch job. The picker polls this — and checks it on mount,
    so a batch keeps reporting progress after closing and reopening the tab."""
    return _batch_job or {"status": "idle"}


@router.post("/ingest/cancel", dependencies=[Depends(require_admin)])
async def ingest_cancel():
    """Stop the running batch after the current document finishes."""
    if not _batch_job or _batch_job["status"] != "running":
        raise HTTPException(status_code=404, detail="No batch running")
    _batch_job["cancel"] = True
    return {"ok": True}


@router.post("/sync", dependencies=[Depends(require_admin)])
async def sync_changed():
    """Update-only delta sync: re-ingests modified docs, reports (but does not
    ingest) new files — insertion happens through the picker."""
    return await sync_changed_documents()


@router.get("/drive-files", dependencies=[Depends(require_admin)])
async def drive_files():
    """All files in the Drive folder for the ingestion picker.
    Only Google Docs are ingestable; others are listed but disabled."""
    files = await list_all_files()
    return [
        {
            "id": f["id"],
            "name": f["name"],
            "mimeType": f["mimeType"],
            "modifiedTime": f.get("modifiedTime"),
            "ingestable": f["mimeType"] == GOOGLE_DOC_MIME,
        }
        for f in sorted(files, key=lambda x: x["name"].lower())
    ]