# backend/app/api/courses.py
"""Public content for the home page: the portfolio (course folders + loose
docs) and the skills diagram data. The old /courses CRUD, /courses/documents,
and /courses/generate-description are gone — modules are now Documents grouped
by an optional Course folder, edited from the homepage in edit mode."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import Course, Document, Skill
from app.sync.google_client import NOTES_PREFIX

router = APIRouter()


def _doc_dict(d: Document) -> dict:
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
        "course_id": str(d.course_id) if d.course_id else None,
        "last_synced_at": d.last_synced_at.isoformat() if d.last_synced_at else None,
        "chunk_count": d.chunk_count or 0,
    }


@router.get("/portfolio")
async def get_portfolio(db: AsyncSession = Depends(get_db)):
    """Everything the modules section renders: course folders with their docs,
    plus folder-less docs at the same level (course_id NULL still displays)."""
    # Modules in progress first, then alphabetical.
    courses = (await db.execute(
        select(Course).order_by(Course.is_currently_learning.desc(), Course.name)
    )).scalars().all()
    docs = (await db.execute(select(Document).order_by(Document.title))).scalars().all()

    by_course: dict[str, list[dict]] = {}
    loose: list[dict] = []
    for d in docs:
        dd = _doc_dict(d)
        if d.course_id:
            by_course.setdefault(str(d.course_id), []).append(dd)
        else:
            loose.append(dd)

    return {
        "courses": [
            {
                "id": str(c.id),
                "name": c.name,
                "summary": c.summary or "",
                "is_currently_learning": bool(c.is_currently_learning),
                "notes": c.notes or "",
                "grade": c.grade or "",
                "docs": by_course.get(str(c.id), []),
            }
            for c in courses
        ],
        "loose_docs": loose,
    }


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