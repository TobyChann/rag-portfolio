# backend/app/api/portfolio.py
"""Public content for the home page: the notes tree (folders + documents), the
skills diagram data, headline stats, and the resume download."""
import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.api.auth import is_admin
from app.cache.redis_client import get_redis
from app.db.database import get_db
from app.db.models import Folder, Document, Skill, Resume, document_skills
from app.revalidate import PUBLIC_STATS_KEY, SKILLS_EVIDENCE_KEY
from app.sync.google_client import NOTES_PREFIX

router = APIRouter()


def _display_name(title: str | None) -> str:
    title = title or ""
    display = title[len(NOTES_PREFIX):] if title.startswith(NOTES_PREFIX) else title
    return display.replace("_", " ").strip() or title


def doc_dict(d: Document, admin: bool = True) -> dict:
    """Visitors get the display fields only; ingestion and curation state
    (tag/parse status, review flag, chunk count) is for the owner."""
    title = d.title or ""
    out = {
        "id": str(d.id),
        "google_doc_id": d.google_doc_id,
        "title": title,
        "display_name": _display_name(title),
        "summary": d.summary or "",
        "skills": [s.name for s in d.skills],       # selectin-loaded, no lazy IO
        "folder_id": str(d.folder_id) if d.folder_id else None,
        "last_synced_at": d.last_synced_at.isoformat() if d.last_synced_at else None,
    }
    if admin:
        out.update({
            "tag_status": d.tag_status or "pending",
            "needs_review": bool(d.needs_review),
            "parse_status": d.parse_status or "text",
            "chunk_count": d.chunk_count or 0,
        })
    return out


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
async def get_portfolio(db: AsyncSession = Depends(get_db), admin: bool = Depends(is_admin)):
    """The whole notes tree as two flat lists; the client links them by
    parent_id / folder_id, so nesting depth is unlimited and it's one round
    trip. Ordered so siblings come out in display order. Visitors see approved
    notes only; the admin cookie returns everything for Curate mode."""
    folders = (await db.execute(select(Folder).order_by(
        Folder.sort_order, Folder.is_currently_learning.desc(), Folder.name))).scalars().all()
    q = select(Document).order_by(Document.title)
    if not admin:
        q = q.where(Document.tag_status == "approved")
    docs = (await db.execute(q)).scalars().all()
    return {"folders": [folder_dict(f) for f in folders],
            "docs": [doc_dict(d, admin) for d in docs]}


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


@router.get("/stats/public")
async def public_stats(db: AsyncSession = Depends(get_db)):
    """Headline numbers for the homepage proof strip. Cached for 5 minutes;
    curation writes and syncs drop the cache early."""
    r = await get_redis()
    cached = await r.get(PUBLIC_STATS_KEY)
    if cached:
        return json.loads(cached)

    approved = Document.tag_status == "approved"
    modules = await db.scalar(select(func.count(Folder.id)).where(Folder.is_course == True))  # noqa: E712
    notes = await db.scalar(select(func.count(Document.id)).where(approved))
    skills = await db.scalar(
        select(func.count(func.distinct(Skill.id)))
        .join(document_skills, document_skills.c.skill_id == Skill.id)
        .join(Document, Document.id == document_skills.c.document_id)
        .where(Skill.achieved == True, Skill.category.isnot(None), approved)  # noqa: E712
    )
    last_synced = await db.scalar(select(func.max(Document.last_synced_at)).where(approved))
    stats = {
        "modules": modules or 0,
        "notes": notes or 0,
        "skills_evidenced": skills or 0,
        "last_synced_at": last_synced.isoformat() if last_synced else None,
    }
    await r.setex(PUBLIC_STATS_KEY, 300, json.dumps(stats))
    return stats


@router.get("/skills/evidence")
async def skills_evidence(db: AsyncSession = Depends(get_db)):
    """Every public skill with the approved notes that evidence it (and each
    note's course and grade). Cached; curation writes and syncs drop it."""
    r = await get_redis()
    cached = await r.get(SKILLS_EVIDENCE_KEY)
    if cached:
        return json.loads(cached)

    rows = (await db.execute(
        select(Skill.name, Skill.category, Skill.sort_order, Document.google_doc_id, Document.title,
               Folder.name, Folder.grade)
        .join(document_skills, document_skills.c.skill_id == Skill.id, isouter=True)
        .join(Document, (Document.id == document_skills.c.document_id) & (Document.tag_status == "approved"),
              isouter=True)
        .join(Folder, Folder.id == Document.folder_id, isouter=True)
        .where(Skill.achieved == True, Skill.category.isnot(None))  # noqa: E712
        .order_by(Skill.sort_order, Skill.name, Document.title))).all()

    skills: dict[str, dict] = {}
    for name, category, _, g, title, module, grade in rows:
        s = skills.setdefault(name, {"name": name, "category": category, "docs": []})
        if g:
            s["docs"].append({"google_doc_id": g, "display_name": _display_name(title),
                              "module": module or "", "grade": grade or ""})
    out = [{**s, "count": len(s["docs"])} for s in skills.values()]
    await r.setex(SKILLS_EVIDENCE_KEY, 300, json.dumps(out))
    return out


@router.get("/notes/{google_doc_id}")
async def note(google_doc_id: str, db: AsyncSession = Depends(get_db)):
    """One approved note for its public page: summary, heading outline (from
    the chunk mirror), skills, where it sits in the module tree, and the 4
    closest notes by mean embedding. Never the note text itself."""
    doc = (await db.execute(select(Document).where(
        Document.google_doc_id == google_doc_id, Document.tag_status == "approved"))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Note not found")

    folders = {f.id: f for f in (await db.execute(select(Folder))).scalars().all()}
    path, seen = [], set()
    f = folders.get(doc.folder_id)
    while f and f.id not in seen:
        seen.add(f.id)
        path.insert(0, f)
        f = folders.get(f.parent_id)
    course = next((f for f in reversed(path) if f.is_course), None)

    outline = (await db.execute(text(
        "SELECT min(chunk_index) AS chunk_index, heading FROM chunks "
        "WHERE google_doc_id = :g AND heading <> '' GROUP BY heading ORDER BY 1"), {"g": google_doc_id})).mappings().all()
    related = (await db.execute(text(
        "WITH d AS (SELECT google_doc_id g, avg(embedding) v FROM chunks GROUP BY 1) "
        "SELECT d2.g, doc.title, coalesce(f.name, '') FROM d d1 JOIN d d2 ON d2.g <> d1.g "
        "JOIN documents doc ON doc.google_doc_id = d2.g AND doc.tag_status = 'approved' "
        "LEFT JOIN folders f ON f.id = doc.folder_id "
        "WHERE d1.g = :g ORDER BY d1.v <=> d2.v LIMIT 4"), {"g": google_doc_id})).all()

    return {
        "google_doc_id": doc.google_doc_id,
        "display_name": _display_name(doc.title),
        "summary": doc.summary or "",
        "skills": [s.name for s in doc.skills],
        "module_path": [f.name for f in path],
        "grade": course.grade if course and course.grade else "",
        "last_synced_at": doc.last_synced_at.isoformat() if doc.last_synced_at else None,
        "outline": [{"chunk_index": o["chunk_index"], "heading": o["heading"]} for o in outline],
        "related": [{"google_doc_id": g, "display_name": _display_name(t), "module": m} for g, t, m in related],
    }


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
