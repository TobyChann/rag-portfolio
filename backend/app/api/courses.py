# backend/app/api/courses.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI

from app.db.database import get_db
from app.db.models import Course, Document, Skill
from app.config import get_settings

router = APIRouter()
settings = get_settings()
_gemini = AsyncOpenAI(
    api_key=settings.gemini_api_key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

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


@router.get("/courses")
async def get_courses(db: AsyncSession = Depends(get_db)):
    """Return all courses for the home page course section."""
    result = await db.execute(select(Course).order_by(Course.year.desc(), Course.name))
    courses = result.scalars().all()
    return [_serialize_course(c) for c in courses]


@router.get("/courses/documents")
async def get_documents_for_linking(db: AsyncSession = Depends(get_db)):
    """Ingested documents for course linking + module display (now carries
    the LLM-generated summary/skills so linked notes can be shown richly)."""
    result = await db.execute(select(Document).order_by(Document.title))
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "google_doc_id": d.google_doc_id,
            "title": d.title,
            "topic": d.topic or "",
            "summary": d.summary or "",
            "skills": d.skills or [],
            "tag_status": d.tag_status or "pending",
        }
        for d in docs
    ]


@router.get("/skills")
async def get_public_skills(db: AsyncSession = Depends(get_db)):
    """PUBLIC. Source of truth for the home page skills diagram (Phase 3).
    Only achieved AND categorised skills appear — uncategorised inventory
    stays private, which is the curation gate. Returns {category: [names]}."""
    result = await db.execute(
        select(Skill)
        .where(Skill.achieved == True, Skill.category.isnot(None))  # noqa: E712
        .order_by(Skill.sort_order, Skill.name)
    )
    grouped: dict[str, list[str]] = {}
    for s in result.scalars().all():
        grouped.setdefault(s.category, []).append(s.name)
    return grouped


class GenerateDescriptionRequest(BaseModel):
    course_name: str
    institution: str
    topics: List[str]
    linked_doc_titles: List[str] = []


@router.post("/courses/generate-description")
async def generate_description(req: GenerateDescriptionRequest):
    """Use gemini-2.5-flash to generate a recommended course description."""
    context_parts = [
        f"Course: {req.course_name}",
        f"Institution: {req.institution}",
        f"Topics covered: {', '.join(req.topics)}" if req.topics else "",
        f"Linked course notes/documents: {', '.join(req.linked_doc_titles)}" if req.linked_doc_titles else "",
    ]
    context = "\n".join(p for p in context_parts if p)

    response = await _gemini.chat.completions.create(
        model="gemini-2.5-flash",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are helping a student write a concise, professional course description "
                    "for their portfolio. Write 2-3 sentences describing what the course covers "
                    "and the key skills or knowledge gained. Be specific and professional. "
                    "Do not start with 'This course' — vary the opening. Maximum 60 words."
                ),
            },
            {"role": "user", "content": context},
        ],
        max_tokens=150,
        temperature=0.7,
        reasoning_effort="none",
    )
    return {"description": response.choices[0].message.content.strip()}