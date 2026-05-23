from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.models import Visitor, Query, Document, Course
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


async def get_visitor_by_session(db: AsyncSession, session_id: str):
    result = await db.execute(
        select(Visitor).where(Visitor.session_id == session_id)
    )
    return result.scalar_one_or_none()


# --- Query ---

async def log_query(db: AsyncSession, session_id: str, question: str,
                    answer: str, chunks_used: list, response_ms: int,
                    cache_hit: str = None):
    query = Query(
        session_id=session_id,
        question=question,
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


# --- Document ---

async def upsert_document(db: AsyncSession, google_doc_id: str,
                           title: str, topic: str, chunk_count: int):
    result = await db.execute(
        select(Document).where(Document.google_doc_id == google_doc_id)
    )
    doc = result.scalar_one_or_none()
    if doc:
        doc.title = title
        doc.topic = topic
        doc.chunk_count = chunk_count
        from sqlalchemy.sql import func
        doc.last_synced_at = func.now()
    else:
        doc = Document(
            google_doc_id=google_doc_id,
            title=title,
            topic=topic,
            chunk_count=chunk_count,
        )
        db.add(doc)
    await db.flush()
    return doc


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
