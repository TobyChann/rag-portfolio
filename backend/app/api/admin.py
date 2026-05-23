from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.db.crud import get_stats
from app.config import get_settings
import os

router = APIRouter()
settings = get_settings()

# Simple token auth for admin routes
# Set ADMIN_SECRET in your .env
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "change-me-in-production")


def verify_admin(x_admin_secret: str = Header(None)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/stats", dependencies=[Depends(verify_admin)])
async def admin_stats(db: AsyncSession = Depends(get_db)):
    """
    Dashboard stats: query counts, visitor breakdown, recent questions.
    Protected by X-Admin-Secret header.
    """
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
