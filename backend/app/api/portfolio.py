# backend/app/api/portfolio.py
"""Public content for the home page: the notes tree (folders + documents), the
skills diagram data, and the resume download."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import Folder, Document, Skill, Resume
from app.sync.google_client import NOTES_PREFIX

router = APIRouter()


def doc_dict(d: Document) -> dict:
    title = d.title or ""
    display = title[len(NOTES_PREFIX):] if title.startswith(NOTES_PREFIX) else title
    return {
        "id": str(d.id),
        "google_doc_id": d.google_doc_id,
        "title": title,
        "display_name": display.replace("_", " ").strip() or title,
        "summary": d.summary or "",
        "skills": [s.name for s in d.skills],       # selectin-loaded, no lazy IO
        "tag_status": d.tag_status or "pending",
        "needs_review": bool(d.needs_review),
        "parse_status": d.parse_status or "text",
        "folder_id": str(d.folder_id) if d.folder_id else None,
        "last_synced_at": d.last_synced_at.isoformat() if d.last_synced_at else None,
        "chunk_count": d.chunk_count or 0,
    }


def folder_dict(f: Folder) -> dict:
    return {
        "id": str(f.id),
        "name": f.name,
        "parent_id": str(f.parent_id) if f.parent_id else None,
        "sort_order": f.sort_order or 0,
        "is_course": bool(f.is_course),
        "summary": f.summary or "",
        "is_currently_learning": bool(f.is_currently_learning),
        "notes": f.notes or "",
        "grade": f.grade or "",
    }


@router.get("/portfolio")
async def get_portfolio(db: AsyncSession = Depends(get_db)):
    """The whole notes tree as two flat lists; the client links them by
    parent_id / folder_id, so nesting depth is unlimited and it's one round
    trip. Ordered so siblings come out in display order."""
    folders = (await db.execute(select(Folder).order_by(
        Folder.sort_order, Folder.is_currently_learning.desc(), Folder.name))).scalars().all()
    docs = (await db.execute(select(Document).order_by(Document.title))).scalars().all()
    return {"folders": [folder_dict(f) for f in folders], "docs": [doc_dict(d) for d in docs]}


@router.get("/skills")
async def get_public_skills(db: AsyncSession = Depends(get_db)):
    """Source of truth for the skills diagram. Only achieved AND categorised
    skills appear — the uncategorised pool stays private (curation gate).
    Returns {category: [names]}."""
    result = await db.execute(
        select(Skill)
        .where(Skill.achieved == True, Skill.category.isnot(None))  # noqa: E712
        .order_by(Skill.sort_order, Skill.name)
    )
    grouped: dict[str, list[str]] = {}
    for s in result.scalars().all():
        grouped.setdefault(s.category, []).append(s.name)
    return grouped

@router.get("/resume/meta")
async def resume_meta(db: AsyncSession = Depends(get_db)):
    """Whether a resume is available, for the home page's download button."""
    r = (await db.execute(select(Resume.filename, Resume.uploaded_at))).first()
    if not r:
        return {"exists": False}
    return {"exists": True, "filename": r.filename,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None}


@router.get("/resume")
async def download_resume(db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Resume))).scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="No resume uploaded")
    return Response(content=r.data, media_type=r.content_type, headers={
        "Content-Disposition": f'attachment; filename="{r.filename}"',
        "Cache-Control": "no-cache",
    })
