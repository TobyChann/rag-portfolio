# backend/app/api/admin.py
import uuid
import asyncio
import hashlib
import hmac
import secrets
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from app.db.database import get_db
from app.db.crud import get_stats
from app.db.models import Folder, Skill, ProfileNote, Document, Resume, EvalRun
from app.evals.run import run_eval, MODES as EVAL_MODES
from app.api.auth import ADMIN_COOKIE, is_admin, require_admin
from app.api.portfolio import doc_dict, folder_dict
from app.revalidate import refresh_public_pages
from app.cache.redis_client import get_redis
from app.cache.query_cache import clear_answer_cache
from app.sync import resume as resume_mod
from app.rag.overview import invalidate_overview
from app.sync.ingestion import (
    ingest_document,
    list_all_files,
    resolve_doc_text,
    generate_doc_tags,
    resolve_skills,
    generate_course_summary,
    sync_changed_documents,
    ingest_lock,
    SyncBusy,
)
from app.sync.google_client import GOOGLE_DOC_MIME
from app.config import get_settings

router = APIRouter()
settings = get_settings()

SESSION_TTL = 60 * 60 * 24 * 30


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _password_ok(password: str) -> bool:
    expected = settings.admin_password_hash
    return bool(expected) and hmac.compare_digest(_hash_password(password), expected)


# ── Auth ────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(req: LoginRequest, response: Response):
    if not _password_ok(req.password):
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
async def me(admin: bool = Depends(is_admin)):
    """Always 200, so the logged-out check on every page view doesn't log a
    401 in visitors' consoles."""
    return {"authenticated": admin}


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, token: str = Depends(require_admin)):
    if not _password_ok(req.current_password):
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
                "rewritten_question": q.rewritten_question,
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
    await refresh_public_pages()
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
    await refresh_public_pages()
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
    await refresh_public_pages()
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
    folder_id: Optional[str] = None   # "" moves the note to the top level


async def _tree_changed():
    """Folder or note-location edits change the modules overview the chatbot
    reads, so drop it and any answers cached from the old one."""
    invalidate_overview()
    await clear_answer_cache()
    await refresh_public_pages()


async def _get_folder(db: AsyncSession, folder_id: str) -> Folder:
    try:
        fid = uuid.UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder = (await db.execute(select(Folder).where(Folder.id == fid))).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


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
    the doc to another folder. Skill names resolve through the inventory —
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
    if req.folder_id is not None:
        doc.folder_id = (await _get_folder(db, req.folder_id)).id if req.folder_id else None

    # Serialize BEFORE commit — commit expires attributes, and touching the
    # skills relationship afterwards would lazy-load → MissingGreenlet.
    payload = doc_dict(doc)
    await db.commit()
    if req.folder_id is not None:
        await _tree_changed()
    else:
        await refresh_public_pages()
    return payload


# ── Folders (the notes tree) ─────────────────────────────

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    is_course: bool = False


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None   # "" moves the folder to the top level
    sort_order: Optional[int] = None
    is_course: Optional[bool] = None
    summary: Optional[str] = None
    is_currently_learning: Optional[bool] = None
    notes: Optional[str] = None
    grade: Optional[str] = None


async def _is_descendant(db: AsyncSession, folder_id: uuid.UUID, maybe_child: uuid.UUID) -> bool:
    """True if maybe_child is folder_id or sits anywhere beneath it. Walks up
    from maybe_child, so cost is the tree depth."""
    parents = dict((await db.execute(select(Folder.id, Folder.parent_id))).all())
    node, seen = maybe_child, set()
    while node is not None and node not in seen:
        if node == folder_id:
            return True
        seen.add(node)
        node = parents.get(node)
    return False


@router.post("/folders", dependencies=[Depends(require_admin)])
async def create_folder(req: FolderCreate, db: AsyncSession = Depends(get_db)):
    parent = (await _get_folder(db, req.parent_id)).id if req.parent_id else None
    folder = Folder(name=req.name.strip() or "Untitled", parent_id=parent, is_course=req.is_course)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    await _tree_changed()
    return folder_dict(folder)


@router.patch("/folders/{folder_id}", dependencies=[Depends(require_admin)])
async def update_folder(folder_id: str, req: FolderUpdate, db: AsyncSession = Depends(get_db)):
    folder = await _get_folder(db, folder_id)
    if req.parent_id is not None:
        if req.parent_id:
            parent = await _get_folder(db, req.parent_id)
            if await _is_descendant(db, folder.id, parent.id):
                raise HTTPException(status_code=400, detail="Can't move a folder into itself")
            folder.parent_id = parent.id
        else:
            folder.parent_id = None
    if req.name is not None:       folder.name = req.name.strip() or folder.name
    if req.sort_order is not None: folder.sort_order = req.sort_order
    if req.is_course is not None:  folder.is_course = req.is_course
    if req.summary is not None:    folder.summary = req.summary.strip()
    if req.is_currently_learning is not None: folder.is_currently_learning = req.is_currently_learning
    if req.notes is not None:      folder.notes = req.notes.strip()
    if req.grade is not None:      folder.grade = req.grade.strip() or None
    await db.commit()
    await db.refresh(folder)
    await _tree_changed()
    return folder_dict(folder)


@router.delete("/folders/{folder_id}", dependencies=[Depends(require_admin)])
async def delete_folder(folder_id: str, db: AsyncSession = Depends(get_db)):
    """Deletes only the folder: its subfolders and notes move up to its parent."""
    folder = await _get_folder(db, folder_id)
    await db.execute(update(Folder).where(Folder.parent_id == folder.id)
                     .values(parent_id=folder.parent_id))
    await db.execute(update(Document).where(Document.folder_id == folder.id)
                     .values(folder_id=folder.parent_id))
    await db.delete(folder)
    await db.commit()
    await _tree_changed()
    return {"ok": True}


@router.post("/folders/{folder_id}/generate-summary", dependencies=[Depends(require_admin)])
async def folder_summary_draft(folder_id: str, db: AsyncSession = Depends(get_db)):
    """Draft a course summary from the summaries of the notes directly inside
    it. Returns a draft only."""
    folder = await _get_folder(db, folder_id)
    docs = (await db.execute(
        select(Document).where(Document.folder_id == folder.id))).scalars().all()
    summaries = [d.summary for d in docs if d.summary]
    if not summaries:
        raise HTTPException(status_code=400, detail="No note summaries in this folder yet")
    try:
        draft = await generate_course_summary(folder.name, summaries)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Summary generation failed: {e}")
    return {"summary": draft}


# ── Ingestion (backend batch job — survives tab close) ───

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
    for d in docs:
        if _batch_job.get("cancel"):
            _batch_job["status"] = "cancelled"
            await refresh_public_pages()
            return
        _batch_job["current"] = d.name or d.id
        # Isolate each doc: one failure (bad export, parse crash, etc.) must not
        # abort the rest of the batch. Record it and move on.
        try:
            async with ingest_lock:   # waits out any sync in progress
                r = await ingest_document(d.id, d.name)
            _batch_job["results"].append({
                "title": r["title"], "chunks": r["chunk_count"],
                "ms": r["elapsed_ms"], "parse_status": r["parse_status"],
            })
        except Exception as e:
            print(f"[batch] {d.name or d.id} FAILED: {e} — continuing")
            _batch_job["results"].append({
                "title": d.name or d.id, "chunks": 0, "ms": 0,
                "parse_status": "error", "error": str(e),
            })
        _batch_job["done"] += 1
        await asyncio.sleep(INGEST_PACING_SECONDS)
    _batch_job["status"] = "done"
    _batch_job["current"] = ""
    await refresh_public_pages()


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


# Last sync run, polled by the admin page. In-memory like _batch_job: a restart
# kills the run and its state together.
_sync_job: dict = {"status": "idle"}


async def _run_sync():
    global _sync_job
    _sync_job = {"status": "running", "started_at": datetime.utcnow().isoformat() + "Z"}
    try:
        result = await sync_changed_documents()
        _sync_job = {**_sync_job, "status": "done", "result": result}
    except SyncBusy:
        _sync_job = {"status": "idle"}
    except Exception as e:
        print(f"[sync] sync failed: {e}")
        _sync_job = {**_sync_job, "status": "error", "error": str(e)}


def _start_sync() -> bool:
    if ingest_lock.locked() or _sync_job.get("status") == "running":
        return False
    asyncio.create_task(_run_sync())
    return True


@router.post("/sync", dependencies=[Depends(require_admin)])
async def sync_changed():
    """Start a delta sync (re-ingest modified docs, add new Notes_* docs) in
    the background; poll GET /sync/status for the result. Runs detached because
    a sync with changes can take minutes — longer than a proxied request should
    be held open."""
    if not _start_sync():
        raise HTTPException(status_code=409, detail="Another sync or ingestion batch is running")
    return {"started": True}


@router.get("/sync/status", dependencies=[Depends(require_admin)])
async def sync_status():
    return _sync_job


@router.post("/sync/cron")
async def sync_cron(authorization: str = Header(default="")):
    """Entry point for an external scheduler (GitHub Actions, any cron
    service), authenticated by CRON_SECRET as a bearer token rather than the
    admin cookie. Not needed when AUTO_SYNC_INTERVAL_MINUTES runs the sync
    in-process."""
    secret = settings.cron_secret
    if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Invalid cron secret")
    if not _start_sync():
        return {"started": False, "reason": "ingestion already running"}
    return {"started": True}


@router.get("/drive-files", dependencies=[Depends(require_admin)])
async def drive_files(db: AsyncSession = Depends(get_db)):
    """All files in the Drive folder for the ingestion picker, joined with each
    doc's ingestion status (last synced, chunk count, parse status) so the picker
    doubles as a sync dashboard — the owner can spot what needs re-ingesting.
    Only Google Docs are ingestable; others are listed but disabled."""
    files = await list_all_files()
    docs = (await db.execute(select(Document))).scalars().all()
    by_gid = {d.google_doc_id: d for d in docs}

    out = []
    for f in sorted(files, key=lambda x: x["name"].lower()):
        doc = by_gid.get(f["id"])
        modified = f.get("modifiedTime")
        last_synced = doc.last_synced_at.isoformat() if (doc and doc.last_synced_at) else None
        # "changed" = the Drive copy was edited after our last successful sync.
        changed = bool(
            doc and doc.last_synced_at and modified
            and datetime.fromisoformat(modified.replace("Z", "+00:00")) > doc.last_synced_at
        )
        out.append({
            "id": f["id"],
            "name": f["name"],
            "mimeType": f["mimeType"],
            "modifiedTime": modified,
            "ingestable": f["mimeType"] == GOOGLE_DOC_MIME,
            "ingested": doc is not None,
            "last_synced_at": last_synced,
            "chunk_count": doc.chunk_count if doc else 0,
            "parse_status": doc.parse_status if doc else None,
            "needs_review": bool(doc.needs_review) if doc else False,
            "changed": changed,
        })
    return out

# ── Resume (download file + chatbot knowledge) ───────────

def _resume_meta(r: Resume | None) -> dict:
    if not r:
        return {"exists": False}
    return {"exists": True, "filename": r.filename, "content_type": r.content_type,
            "size": len(r.data), "text_chars": len(r.text or ""),
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None}


@router.get("/resume", dependencies=[Depends(require_admin)])
async def resume_status(db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Resume))).scalars().first()
    return _resume_meta(r)


@router.post("/resume", dependencies=[Depends(require_admin)])
async def upload_resume(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload or replace the resume: stores the file and its text (contact
    details stripped) for the chatbot, and clears cached chatbot answers."""
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower()
    content_type = resume_mod.ALLOWED_TYPES.get(ext)
    if not content_type:
        raise HTTPException(status_code=400, detail="Upload a .pdf or .docx file")
    data = await file.read()
    if len(data) > resume_mod.MAX_BYTES:
        raise HTTPException(status_code=400, detail="File is larger than 5 MB")

    try:
        text = resume_mod.to_markdown(
            await asyncio.to_thread(resume_mod.extract_text, data, content_type))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Couldn't read that file: {e}")
    if len(text) < 200:
        raise HTTPException(status_code=400, detail="Couldn't find enough text in that file "
                                                    "(is it a scanned image?)")
    for old in (await db.execute(select(Resume))).scalars().all():
        await db.delete(old)
    r = Resume(filename=file.filename, content_type=content_type, data=data,
               text=text)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    resume_mod.invalidate_resume_cache()
    await clear_answer_cache()
    await refresh_public_pages()
    return _resume_meta(r)


@router.delete("/resume", dependencies=[Depends(require_admin)])
async def delete_resume(db: AsyncSession = Depends(get_db)):
    for old in (await db.execute(select(Resume))).scalars().all():
        await db.delete(old)
    await db.commit()
    resume_mod.invalidate_resume_cache()
    await clear_answer_cache()
    await refresh_public_pages()
    return {"exists": False}


# ── Evals (retrieval / answer quality over evals/golden.jsonl) ──

class EvalRequest(BaseModel):
    modes: List[str] = ["dense"]
    top_k: int = 5
    answers: bool = False
    judge: bool = False


_eval_job: dict = {"status": "idle"}   # in-memory like _sync_job


async def _run_eval_job(req: EvalRequest):
    global _eval_job
    try:
        results = await run_eval(req.modes, req.top_k, req.answers, req.judge)
        _eval_job = {"status": "done", "run_ids": [r["id"] for r in results]}
    except Exception as e:
        print(f"[eval] failed: {e}")
        _eval_job = {"status": "error", "error": str(e)}


@router.post("/evals/run", dependencies=[Depends(require_admin)])
async def start_eval(req: EvalRequest):
    """Run the eval in the background; poll GET /evals/status, then GET /evals."""
    global _eval_job
    bad = [m for m in req.modes if m not in EVAL_MODES]
    if bad or not req.modes:
        raise HTTPException(status_code=400, detail=f"modes must be from {list(EVAL_MODES)}")
    if _eval_job.get("status") == "running":
        raise HTTPException(status_code=409, detail="An eval is already running")
    _eval_job = {"status": "running", "started_at": datetime.utcnow().isoformat() + "Z"}
    asyncio.create_task(_run_eval_job(req))
    return {"started": True}


@router.get("/evals/status", dependencies=[Depends(require_admin)])
async def eval_status():
    return _eval_job


@router.get("/evals", dependencies=[Depends(require_admin)])
async def list_evals(limit: int = 20, db: AsyncSession = Depends(get_db)):
    runs = (await db.execute(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(limit))).scalars().all()
    return [{"id": str(r.id), "created_at": r.created_at.isoformat(), "config": r.config,
             "metrics": r.metrics} for r in runs]


@router.get("/evals/{run_id}", dependencies=[Depends(require_admin)])
async def get_eval(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(EvalRun).where(EvalRun.id == run_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Eval run not found")
    return {"id": str(r.id), "created_at": r.created_at.isoformat(), "config": r.config,
            "metrics": r.metrics, "per_question": r.per_question}
