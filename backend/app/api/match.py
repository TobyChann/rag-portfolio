# backend/app/api/match.py
import hashlib
import json
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.cache.query_cache import get_session
from app.cache.rate_limiter import hit_rate_limit
from app.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import Match, Visitor
from app.llm import is_transient_llm_error
from app.rag.match import stream_match

router = APIRouter()
settings = get_settings()


class MatchRequest(BaseModel):
    jd: str = Field(min_length=80, max_length=8000)
    session_id: str


def _line(ev: dict) -> str:
    return json.dumps(ev) + "\n"


def _replay(m: Match):
    r = m.result
    yield _line({"type": "requirements", "company_guess": r.get("company_guess"), "role_title": r.get("role_title"),
                 "requirements": [{k: row[k] for k in ("id", "text", "kind", "must_have")} for row in r["rows"]]})
    for row in r["rows"]:
        yield _line({"type": "row", "row": row})
    yield _line({"type": "summary", **r["summary"]})
    yield _line({"type": "done", "match_id": str(m.id), "cached": True})


@router.post("/match")
async def match(req: MatchRequest, request: Request):
    """Grade a job description against Toby's notes and resume, streamed as
    NDJSON: requirements, row (one per requirement), summary, done. A JD seen
    before replays its stored result instantly and doesn't count against the
    hourly limit."""
    if not await get_session(req.session_id):
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please refresh.")
    jd_hash = hashlib.sha256(" ".join(req.jd.lower().split()).encode()).hexdigest()

    async with AsyncSessionLocal() as db:
        cached = (await db.execute(select(Match).where(Match.jd_hash == jd_hash)
                                   .order_by(Match.created_at.desc()).limit(1))).scalar_one_or_none()
    if cached:
        return StreamingResponse(_replay(cached), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    await hit_rate_limit(request, "match:", settings.match_rate_limit_per_hour, "job matches")

    async def events():
        result = {"rows": []}
        try:
            async for ev in stream_match(req.jd):
                if ev["type"] == "requirements":
                    result.update(company_guess=ev["company_guess"], role_title=ev["role_title"])
                elif ev["type"] == "row":
                    result["rows"].append(ev["row"])
                elif ev["type"] == "summary":
                    result["summary"] = {k: v for k, v in ev.items() if k != "type"}
                yield _line(ev)
        except Exception as e:
            print(f"[match] failed: {e}")
            detail = ("The model is briefly busy. Please try again in a moment."
                      if is_transient_llm_error(e) else "Something went wrong matching that job description.")
            yield _line({"type": "error", "detail": detail})
            return

        match_id = None
        try:
            async with AsyncSessionLocal() as db:
                ref = (await db.execute(select(Visitor.referrer)
                                        .where(Visitor.session_id == req.session_id))).scalar_one_or_none()
                m = Match(jd_hash=jd_hash, jd_excerpt=req.jd[:300], company_guess=result.get("company_guess"),
                          ref=ref or None, session_id=req.session_id, result=result)
                db.add(m)
                await db.commit()
                match_id = str(m.id)
        except Exception as e:
            print(f"[match] save failed (non-fatal): {e}")
        yield _line({"type": "done", "match_id": match_id, "cached": False})

    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/match/{match_id}")
async def get_match(match_id: uuid.UUID):
    """A stored result, for the shareable /match/[id] page. The JD itself
    isn't returned beyond its first 300 characters."""
    async with AsyncSessionLocal() as db:
        m = (await db.execute(select(Match).where(Match.id == match_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return {"id": str(m.id), "created_at": m.created_at.isoformat(), "jd_excerpt": m.jd_excerpt, **m.result}
