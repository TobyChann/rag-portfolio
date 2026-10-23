# backend/app/rag/pipeline.py
import asyncio
import time
from openai import AsyncOpenAI
from app.rag.embedder import embed_query
from app.rag.retriever import search
from app.sync.resume import get_resume_text
from app.rag.overview import get_overview
from app.cache.query_cache import get_cached_answer, set_cached_answer
from app.config import get_settings
from app.llm import gemini_client, is_transient_llm_error

settings = get_settings()

# Visitor answers run on OpenAI when a funded key is configured — it avoids the
# free-tier 503 "high demand" errors Gemini throws at unpaid traffic. Flip
# rag_provider to "gemini" (or drop the OpenAI key) to fall back.
_use_openai = settings.rag_provider == "openai" and bool(settings.openai_api_key)
if _use_openai:
    client = AsyncOpenAI(api_key=settings.openai_api_key)   # default OpenAI base
    RAG_MODEL = settings.openai_rag_model
    _EXTRA_PARAMS: dict = {}   # OpenAI chat models reject reasoning_effort
else:
    client = gemini_client()
    RAG_MODEL = settings.rag_model
    _EXTRA_PARAMS = {"reasoning_effort": "none"}   # Gemini: keep thinking off


# Transient errors get a quick retry. A visitor is waiting, so retries are few
# and short rather than the long backoff used for batch ingestion.
async def _complete_with_retry(**kwargs):
    """chat.completions.create with a couple of short retries on transient
    overload (503/UNAVAILABLE), rate-limit, or network blips."""
    delay = 1.5
    for attempt in range(3):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            if attempt < 2 and is_transient_llm_error(e):
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise


def _sources_from_chunks(chunks: list[dict]) -> list[dict]:
    """Deduplicated source docs behind an answer, so the UI can link each back to
    its note. Keeps first-seen order (highest-scoring first). Chunks without a
    doc_id (e.g. pre-upgrade cache entries) are skipped."""
    seen, sources = set(), []
    for c in chunks:
        doc_id = c.get("doc_id")
        if not doc_id or doc_id in seen:
            continue
        seen.add(doc_id)
        sources.append({"google_doc_id": doc_id, "title": c.get("doc_title", "")})
    return sources

SYSTEM_PROMPT = """You answer visitors' questions about Toby, a student whose portfolio this is.
Use only the provided context (Toby's study notes and resume). If the context doesn't
cover the question, say so plainly rather than guessing.

Voice:
- Refer to Toby by name ("Toby studied...", "Toby's internship at...").
  Never use pronouns for Toby (no he/she/they/his/her/their) and never "the candidate";
  repeat the name or restructure the sentence instead.
- Two context blocks are always included: "Resume" (Toby's resume: work experience,
  projects, skills) and "Modules overview" (every course Toby has taken, grouped by
  area, with grade and summary). Use the overview for broad "what has Toby studied"
  questions, the study-note excerpts for detail on a topic, and the resume for work
  and projects. Ignore whatever doesn't bear on the question.

Format (Markdown, rendered in a small chat window — keep it skimmable):
- Open with one short sentence that answers the question directly.
- Then the specifics as a bulleted list ("- "), one tight line each, 2-6 bullets.
  Bold the key term at the start of a bullet when it helps scanning (e.g. "- **SQL**: ...").
- Use a short "### " heading only when the answer has two distinct groups.
- No tables, no horizontal rules, no closing summary or filler.
"""

NO_CONTEXT_ANSWER = "I couldn't find anything about that in Toby's notes or resume."


def _chunk_meta(chunks: list[dict]) -> list[dict]:
    """What gets cached and logged per answer. Keeps doc_id so cached answers
    can still link their sources."""
    return [{"doc_id": c["doc_id"], "doc_title": c["doc_title"], "heading": c["heading"],
             "score": c["score"]} for c in chunks]


def _llm_messages(question: str, chunks: list[dict], resume: str = "",
                  overview: str = "") -> list[dict]:
    blocks = [f"[From: {c['doc_title']} — {c['heading']}]\n{c['text']}" for c in chunks]
    if overview:
        blocks.insert(0, f"[From: Modules overview]\n{overview}")
    if resume:
        blocks.insert(0, f"[From: Resume]\n{resume}")
    context = "\n\n---\n\n".join(blocks)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]


# On Gemini, reasoning_effort="none" keeps thinking tokens from eating max_tokens
# and truncating the answer; OpenAI models omit that param (see _EXTRA_PARAMS).
_GEN_PARAMS = dict(max_tokens=1024, temperature=0.2, **_EXTRA_PARAMS)


async def stream_rag_query(question: str):
    """Async generator of answer events, so the UI can render while the model
    writes:
      {"type": "sources", "sources": [...]}   once, before any text
      {"type": "delta", "text": "..."}        repeatedly
      {"type": "done", "answer", "chunks", "cache_hit", "response_ms"}
    Exceptions propagate; the caller turns them into an error event."""
    start = time.time()

    cached = await get_cached_answer(question)
    if cached:
        yield {"type": "sources", "sources": _sources_from_chunks(cached["chunks"])}
        yield {"type": "delta", "text": cached["answer"]}
        yield {"type": "done", "answer": cached["answer"], "chunks": cached["chunks"],
               "cache_hit": "redis", "response_ms": 0}
        return

    chunks = await search(question, await embed_query(question))
    resume = await get_resume_text()
    overview = await get_overview()
    if not chunks and not resume and not overview:
        yield {"type": "sources", "sources": []}
        yield {"type": "delta", "text": NO_CONTEXT_ANSWER}
        yield {"type": "done", "answer": NO_CONTEXT_ANSWER, "chunks": [], "cache_hit": None,
               "response_ms": round((time.time() - start) * 1000)}
        return

    meta = _chunk_meta(chunks)
    yield {"type": "sources", "sources": _sources_from_chunks(meta)}

    # Retries only cover opening the stream (where 503s/429s surface); once
    # tokens are flowing a failure ends the answer.
    stream = await _complete_with_retry(model=RAG_MODEL,
                                        messages=_llm_messages(question, chunks, resume, overview),
                                        stream=True, **_GEN_PARAMS)
    parts = []
    async for event in stream:
        delta = event.choices[0].delta.content if event.choices else None
        if delta:
            parts.append(delta)
            yield {"type": "delta", "text": delta}

    answer = "".join(parts)
    await set_cached_answer(question, answer, meta)
    yield {"type": "done", "answer": answer, "chunks": meta, "cache_hit": None,
           "response_ms": round((time.time() - start) * 1000)}


async def run_rag_query(question: str) -> dict:
    """Non-streaming form: the same pipeline, collected into one result.
    Returns {answer, chunks, sources, response_ms, cache_hit}."""
    sources = []
    async for event in stream_rag_query(question):
        if event["type"] == "sources":
            sources = event["sources"]
        elif event["type"] == "done":
            return {"answer": event["answer"], "chunks": event["chunks"], "sources": sources,
                    "response_ms": event["response_ms"], "cache_hit": event["cache_hit"]}
    raise RuntimeError("RAG stream ended without a result")
