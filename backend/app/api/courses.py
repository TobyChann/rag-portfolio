from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import Course

router = APIRouter()


@router.get("/courses")
async def get_courses(db: AsyncSession = Depends(get_db)):
    """Return all courses for the home page course section."""
    result = await db.execute(select(Course).order_by(Course.year.desc(), Course.name))
    courses = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "institution": c.institution or "SMU",
            "year": c.year or 0,
            "summary": c.summary or "",
            "topics": c.topics or [],
        }
        for c in courses
    ]