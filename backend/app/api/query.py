from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.pipeline import run_rag_query, RAG_MODEL
from app.llm_errors import is_transient_llm_error
from app.db.database import get_db
from app.db.crud import log_query, update_feedback, create_visitor
from app.cache.rate_limiter import check_rate_limit
from app.cache.query_cache import set_session, get_session
import uuid

router = APIRouter()


class OnboardRequest(BaseModel):
    role: str
    industry: str
    referrer: str = ""


class QueryRequest(BaseModel):
    question: str
    session_id: str


class FeedbackRequest(BaseModel):
    query_id: str
    feedback: int


@router.post("/onboard")
async def onboard(
    req: OnboardRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
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
        await set_session(session_id, {"role": req.role, "industry": req.industry})
        return {"session_id": session_id}
    except Exception as e:
        print(f"[onboard] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def query(
    req: QueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(check_rate_limit),
):
    # Validate query length
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if len(req.question) > 500:
        raise HTTPException(status_code=400, detail="Question too long (max 500 chars)")

    # Validate session
    session = await get_session(req.session_id)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session. Please reopen the chat."
        )

    try:
        result = await run_rag_query(req.question)
    except Exception as e:
        print(f"[query] RAG pipeline error: {e}")
        if is_transient_llm_error(e):
            raise HTTPException(
                status_code=503,
                detail="The model is briefly busy. Please try again in a moment.",
            )
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {str(e)}")

    try:
        logged = await log_query(
            db,
            session_id=req.session_id,
            question=req.question,
            answer=result["answer"],
            chunks_used=result["chunks"],
            response_ms=result["response_ms"],
            cache_hit=result["cache_hit"],
        )
    except Exception as e:
        print(f"[query] DB logging error (non-fatal): {e}")
        # Return answer even if logging fails
        return {
            "answer": result["answer"],
            "query_id": None,
            "cache_hit": result["cache_hit"],
            "response_ms": result["response_ms"],
            "sources": result.get("sources", []),
        }

    return {
        "answer": result["answer"],
        "query_id": str(logged.id),
        "cache_hit": result["cache_hit"],
        "response_ms": result["response_ms"],
        "sources": result.get("sources", []),
    }


@router.get("/meta")
async def meta():
    """Public: which model answers visitor queries, so the chat UI never
    advertises a different model than the one actually configured."""
    return {"answer_model": RAG_MODEL}


@router.post("/feedback")
async def feedback(
    req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    if req.feedback not in (1, -1):
        raise HTTPException(status_code=400, detail="Feedback must be 1 or -1")
    await update_feedback(db, req.query_id, req.feedback)
    return {"ok": True}


@router.get("/debug/health")
async def debug_health():
    """Check all connections. Useful for diagnosing 500s."""
    results = {}

    # Redis
    try:
        from app.cache.redis_client import get_redis
        r = await get_redis()
        await r.ping()
        results["redis"] = "ok"
    except Exception as e:
        results["redis"] = f"FAIL: {e}"

    # Zilliz — run synchronous gRPC init in a thread to avoid blocking the event loop
    try:
        import asyncio
        from app.rag.retriever import get_client
        await asyncio.get_event_loop().run_in_executor(None, get_client)
        results["zilliz"] = "ok"
    except Exception as e:
        results["zilliz"] = f"FAIL: {e}"

    # LLM keys present, and which model is answering
    from app.config import get_settings
    s = get_settings()
    results["openai_key"] = "set" if s.openai_api_key else "MISSING"
    results["gemini_key"] = "set" if s.gemini_api_key else "MISSING"
    results["answer_model"] = RAG_MODEL

    return results