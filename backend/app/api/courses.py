from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI

from app.db.database import get_db
from app.db.models import Course, Document
from app.config import get_settings

router = APIRouter()
settings = get_settings()
_openai = AsyncOpenAI(api_key=settings.openai_api_key)


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
    """Return all ingested documents for the course linking dropdown."""
    result = await db.execute(select(Document).order_by(Document.title))
    docs = result.scalars().all()
    return [
        {"id": str(d.id), "google_doc_id": d.google_doc_id, "title": d.title, "topic": d.topic or ""}
        for d in docs
    ]


class GenerateDescriptionRequest(BaseModel):
    course_name: str
    institution: str
    topics: List[str]
    linked_doc_titles: List[str] = []


@router.post("/courses/generate-description")
async def generate_description(req: GenerateDescriptionRequest):
    """Use GPT-4o-mini to generate a recommended course description."""
    context_parts = [
        f"Course: {req.course_name}",
        f"Institution: {req.institution}",
        f"Topics covered: {', '.join(req.topics)}" if req.topics else "",
        f"Linked course notes/documents: {', '.join(req.linked_doc_titles)}" if req.linked_doc_titles else "",
    ]
    context = "\n".join(p for p in context_parts if p)

    response = await _openai.chat.completions.create(
        model="gpt-4o-mini",
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
    )
    return {"description": response.choices[0].message.content.strip()}