import json

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.pipeline import run_rag_query, stream_rag_query, RAG_MODEL
from app.llm import is_transient_llm_error
from app.db.database import get_db, AsyncSessionLocal
from app.db.crud import log_query, update_feedback, create_visitor
from app.db.models import Visitor, VisitorRole
from app.cache.rate_limiter import check_rate_limit
from app.cache.query_cache import (set_session, get_session, get_conversation, append_turn,
                                   clear_conversation)
from app.api.auth import require_admin
from app.config import get_settings
from app.client_ip import client_ip
import uuid

router = APIRouter()
settings = get_settings()


class OnboardRequest(BaseModel):
    role: Optional[VisitorRole] = None
    industry: Optional[str] = Field(default=None, max_length=50)
    referrer: str = Field(default="", max_length=200)


class VisitorUpdate(BaseModel):
    session_id: str
    role: Optional[VisitorRole] = None
    industry: Optional[str] = Field(default=None, max_length=50)
    # Set from a JD match ("Ask a follow-up about this role"); "" clears it.
    role_context: Optional[str] = Field(default=None, max_length=1500)


class QueryRequest(BaseModel):
    question: str
    session_id: str
    doc_id: Optional[str] = Field(default=None, max_length=200)   # "Ask about this note"


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
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            referrer=req.referrer,
        )
        await set_session(session_id, {"role": req.role and req.role.value, "industry": req.industry})
        return {"session_id": session_id}
    except Exception as e:
        print(f"[onboard] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/visitor")
async def update_visitor(req: VisitorUpdate, db: AsyncSession = Depends(get_db)):
    """Role / industry are asked after the first answer, not before it; this
    fills them in on the visitor row and the session."""
    session = await get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    visitor = (await db.execute(
        select(Visitor).where(Visitor.session_id == req.session_id))).scalar_one_or_none()
    if req.role is not None:
        session["role"] = req.role.value
        if visitor:
            visitor.role = req.role
    if req.industry is not None:
        session["industry"] = req.industry
        if visitor:
            visitor.industry = req.industry
    if req.role_context is not None:
        session["role_context"] = req.role_context.strip() or None
    await set_session(req.session_id, session)
    return {"ok": True}


@router.post("/query")
async def query(
    req: QueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(check_rate_limit),
):
    session = await _validate(req)

    try:
        result = await run_rag_query(req.question, await get_conversation(req.session_id),
                                     session.get("role_context"))
        await append_turn(req.session_id, req.question, result["answer"], settings.session_ttl_seconds)
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
            rewritten_question=result["rewritten_question"],
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


async def _validate(req: QueryRequest) -> dict:
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if len(req.question) > 500:
        raise HTTPException(status_code=400, detail="Question too long (max 500 chars)")
    session = await get_session(req.session_id)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session. Please reopen the chat."
        )
    return session


@router.post("/query/stream")
async def query_stream(
    req: QueryRequest,
    _: None = Depends(check_rate_limit),
):
    """Streaming /query: newline-delimited JSON events — sources (with citation
    numbers), text deltas, then trace, followups and done (with the query_id
    for feedback). Validation errors still return normal HTTP status codes
    because they're raised before streaming starts."""
    session = await _validate(req)
    history = await get_conversation(req.session_id)

    async def events():
        try:
            async for ev in stream_rag_query(req.question, history, session.get("role_context"), req.doc_id):
                if ev["type"] != "done":
                    yield json.dumps(ev) + "\n"
                    continue
                await append_turn(req.session_id, req.question, ev["answer"], settings.session_ttl_seconds)
                query_id = None
                # Own session: the request-scoped one may already be closed by the
                # time a long stream finishes.
                try:
                    async with AsyncSessionLocal() as db:
                        logged = await log_query(
                            db, session_id=req.session_id, question=req.question,
                            answer=ev["answer"], chunks_used=ev["chunks"],
                            response_ms=ev["response_ms"], cache_hit=ev["cache_hit"],
                            rewritten_question=ev["rewritten_question"],
                        )
                        await db.commit()
                        query_id = str(logged.id)
                except Exception as e:
                    print(f"[query] DB logging error (non-fatal): {e}")
                yield json.dumps({"type": "trace", **ev["trace"]}) + "\n"
                if ev["followups"]:
                    yield json.dumps({"type": "followups", "questions": ev["followups"]}) + "\n"
                yield json.dumps({"type": "done", "query_id": query_id,
                                  "cache_hit": ev["cache_hit"],
                                  "response_ms": ev["response_ms"]}) + "\n"
        except Exception as e:
            print(f"[query] RAG stream error: {e}")
            detail = ("The model is briefly busy. Please try again in a moment."
                      if is_transient_llm_error(e) else "Something went wrong answering that.")
            yield json.dumps({"type": "error", "detail": detail}) + "\n"

    # X-Accel-Buffering stops reverse proxies (nginx-style) from holding the stream.
    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.delete("/conversation")
async def delete_conversation(session_id: str):
    """"New chat": forget the turns follow-ups are resolved against."""
    await clear_conversation(session_id)
    return {"ok": True}


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


@router.get("/debug/health", dependencies=[Depends(require_admin)])
async def debug_health():
    """Check all connections. Useful for diagnosing 500s. Admin-only: the
    failure messages can leak connection details."""
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
    s = get_settings()
    results["openai_key"] = "set" if s.openai_api_key else "MISSING"
    results["gemini_key"] = "set" if s.gemini_api_key else "MISSING"
    results["answer_model"] = RAG_MODEL

    return results