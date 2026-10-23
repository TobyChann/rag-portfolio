from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.models import Visitor, Query, Document
import uuid


# --- Visitor ---

async def create_visitor(db: AsyncSession, session_id: str, role: str,
                          industry: str, ip: str, user_agent: str, referrer: str):
    visitor = Visitor(
        session_id=session_id,
        role=role,
        industry=industry,
        ip_address=ip,
        user_agent=user_agent,
        referrer=referrer,
    )
    db.add(visitor)
    await db.flush()
    return visitor


# --- Query ---

async def log_query(db: AsyncSession, session_id: str, question: str,
                    answer: str, chunks_used: list, response_ms: int,
                    cache_hit: str = None, rewritten_question: str = None):
    query = Query(
        session_id=session_id,
        question=question,
        rewritten_question=rewritten_question,
        answer=answer,
        chunks_used=chunks_used,
        response_ms=response_ms,
        cache_hit=cache_hit,
    )
    db.add(query)
    await db.flush()
    return query


async def update_feedback(db: AsyncSession, query_id: str, feedback: int):
    result = await db.execute(
        select(Query).where(Query.id == uuid.UUID(query_id))
    )
    query = result.scalar_one_or_none()
    if query:
        query.feedback = feedback
        await db.flush()
    return query


# --- Admin stats ---

async def get_stats(db: AsyncSession):
    total_queries = await db.execute(select(func.count(Query.id)))
    total_visitors = await db.execute(select(func.count(Visitor.id)))
    total_docs = await db.execute(select(func.count(Document.id)))
    recent_queries = await db.execute(
        select(Query).order_by(desc(Query.created_at)).limit(20)
    )
    role_counts = await db.execute(
        select(Visitor.role, func.count(Visitor.id))
        .group_by(Visitor.role)
    )
    return {
        "total_queries": total_queries.scalar(),
        "total_visitors": total_visitors.scalar(),
        "total_docs": total_docs.scalar(),
        "recent_queries": recent_queries.scalars().all(),
        "role_breakdown": dict(role_counts.all()),
    }