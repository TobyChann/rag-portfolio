from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, constr
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.pipeline import run_rag_query
from app.db.database import get_db
from app.db.crud import log_query, update_feedback, get_visitor_by_session, create_visitor
from app.cache.rate_limiter import check_rate_limit
from app.cache.query_cache import set_session, get_session
import uuid

router = APIRouter()


class OnboardRequest(BaseModel):
    role: str                   # recruiter | hiring_manager | peer | curious
    industry: str               # Finance | Tech | Gov | Other
    referrer: str = ""


class QueryRequest(BaseModel):
    question: constr(min_length=1, max_length=500)
    session_id: str


class FeedbackRequest(BaseModel):
    query_id: str
    feedback: int               # 1 or -1


@router.post("/onboard")
async def onboard(
    req: OnboardRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Called when user completes the role/industry selection. Creates session."""
    session_id = str(uuid.uuid4())

    await create_visitor(
        db,
        session_id=session_id,
        role=req.role,
        industry=req.industry,
        ip=request.client.host,
        user_agent=request.headers.get("user-agent", ""),
        referrer=req.referrer,
    )

    # Store in Redis for fast session lookups
    await set_session(session_id, {"role": req.role, "industry": req.industry})

    return {"session_id": session_id}


@router.post("/query")
async def query(
    req: QueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(check_rate_limit),
):
    """Main RAG query endpoint."""
    # Validate session exists
    session = await get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please re-open the chat.")

    # Run RAG pipeline
    result = await run_rag_query(req.question)

    # Log to Postgres
    logged = await log_query(
        db,
        session_id=req.session_id,
        question=req.question,
        answer=result["answer"],
        chunks_used=result["chunks"],
        response_ms=result["response_ms"],
        cache_hit=result["cache_hit"],
    )

    return {
        "answer": result["answer"],
        "query_id": str(logged.id),
        "cache_hit": result["cache_hit"],
        "response_ms": result["response_ms"],
    }


@router.post("/feedback")
async def feedback(
    req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit thumbs up/down on a query response."""
    if req.feedback not in (1, -1):
        raise HTTPException(status_code=400, detail="Feedback must be 1 or -1")
    await update_feedback(db, req.query_id, req.feedback)
    return {"ok": True}
