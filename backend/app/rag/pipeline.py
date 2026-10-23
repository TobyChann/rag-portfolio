# backend/app/rag/pipeline.py
import asyncio
import re
import time
from openai import AsyncOpenAI
from sqlalchemy import select
from app.rag.embedder import embed_query
from app.rag.retriever import search
from app.sync.resume import get_resume_text
from app.rag.overview import get_overview
from app.cache.query_cache import get_cached_answer, set_cached_answer
from app.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import Document, Folder
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

Citations:
- Study-note excerpts are numbered [1], [2], ... When a sentence or bullet draws on one,
  cite it at the end like [2] (or [1][3]). Only use numbers that appear in the context;
  don't cite the resume or the overview.

Format (Markdown, rendered in a small chat window — keep it skimmable):
- Open with one short sentence that answers the question directly.
- Then the specifics as a bulleted list ("- "), one tight line each, 2-6 bullets.
  Bold the key term at the start of a bullet when it helps scanning (e.g. "- **SQL**: ...").
- Use a short "### " heading only when the answer has two distinct groups.
- No tables, no horizontal rules, no closing summary or filler.
"""

CONDENSE_PROMPT = """Rewrite the visitor's latest message as one standalone question about Toby
that makes sense without the conversation (resolve "that", "it", "what about X"). If it
already stands alone, return it unchanged. Reply with the question only."""

NO_CONTEXT_ANSWER = "I couldn't find anything about that in Toby's notes or resume."

# The answer prompt replays this many recent turns verbatim, so replies read
# naturally; retrieval only ever sees the condensed standalone question.
ANSWER_HISTORY_TURNS = 2


async def condense(question: str, history: list[dict]) -> str:
    """Standalone version of a follow-up, for retrieval and the cache key."""
    convo = "\n".join(f"Visitor: {t['q']}\nAssistant: {t['a']}" for t in history)
    try:
        res = await _complete_with_retry(
            model=RAG_MODEL, max_tokens=80, temperature=0, **_EXTRA_PARAMS,
            messages=[{"role": "system", "content": CONDENSE_PROMPT},
                      {"role": "user", "content": f"Conversation:\n{convo}\n\nLatest message: {question}"}])
        rewritten = (res.choices[0].message.content or "").strip().strip('"')
        return rewritten or question
    except Exception as e:
        print(f"[rag] condense failed, using the raw question: {e}")
        return question


async def _doc_modules() -> dict[str, str]:
    """google_doc_id -> name of the folder the note sits in."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Document.google_doc_id, Folder.name)
                                 .join(Folder, Folder.id == Document.folder_id, isouter=True))).all()
    return {g: name or "" for g, name in rows}


def _chunk_meta(chunks: list[dict]) -> list[dict]:
    """What gets cached and logged per answer: enough to rebuild sources,
    citations and the retrieval trace on a cache hit."""
    return [{"id": c.get("id"), "doc_id": c["doc_id"], "doc_title": c["doc_title"],
             "heading": c["heading"], "chunk_index": c.get("chunk_index"), "score": c["score"],
             "dense_rank": c.get("dense_rank"), "lexical_rank": c.get("lexical_rank")}
            for c in chunks]


def _sources(meta: list[dict], modules: dict[str, str]) -> list[dict]:
    """One entry per note behind the answer, best-scoring first. Chunks without
    a doc_id (pre-upgrade cache entries) are skipped."""
    by_doc: dict[str, dict] = {}
    for c in meta:
        if not c.get("doc_id"):
            continue
        s = by_doc.setdefault(c["doc_id"], {"google_doc_id": c["doc_id"], "title": c.get("doc_title", ""),
                                            "module": modules.get(c["doc_id"], ""), "chunk_ids": [],
                                            "best_score": c["score"]})
        s["chunk_ids"].append(c.get("id"))
        s["best_score"] = max(s["best_score"], c["score"])
    return list(by_doc.values())


def _citations(meta: list[dict]) -> list[dict]:
    """[n] in the answer -> the chunk it cites (same order as the prompt)."""
    return [{"n": i + 1, "google_doc_id": c["doc_id"], "heading": c["heading"], "chunk_index": c.get("chunk_index")}
            for i, c in enumerate(meta)]


def _llm_messages(question: str, chunks: list[dict], resume: str = "", overview: str = "",
                  history: list[dict] | None = None) -> list[dict]:
    blocks = [f"[{i + 1}] (From: {c['doc_title']} — {c['heading']})\n{c['text']}" for i, c in enumerate(chunks)]
    if overview:
        blocks.insert(0, f"(From: Modules overview)\n{overview}")
    if resume:
        blocks.insert(0, f"(From: Resume)\n{resume}")
    context = "\n\n---\n\n".join(blocks)
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}]
    for turn in (history or [])[-ANSWER_HISTORY_TURNS:][::-1]:
        messages[1:1] = [{"role": "user", "content": turn["q"]}, {"role": "assistant", "content": turn["a"]}]
    return messages


_HEADING_NOISE = re.compile(r"^(image|question|quiz|week|deck|lab|example|notes?|random|feedback|team|"
                            r"step|recap|summary|exam|steps|tier|case|task|assumption|comparison)\b", re.I)


def _clean_heading(h: str) -> str:
    h = re.sub(r"\$[^$]*\$", "", h or "")            # LaTeX like $\rightarrow$
    h = re.sub(r"^[#\s\d.)(:-]+", "", h)              # markdown hashes, numbering
    h = re.sub(r"\(.*?\)|[`*_]", "", h)
    return re.sub(r"\s+", " ", h).strip(" :-–—")


def _followups(meta: list[dict], answer: str, asked: list[str]) -> list[str]:
    """Up to 3 next questions from the headings of retrieved chunks the answer
    didn't cover. No LLM: cheap and can't drift off the notes."""
    seen = {q.lower() for q in asked}
    out: list[str] = []
    for c in meta:
        topic = _clean_heading(c.get("heading", ""))
        if (len(topic) < 4 or len(topic) > 60 or not re.search(r"[A-Za-z]{3}", topic)
                or _HEADING_NOISE.match(topic) or topic.lower() in answer.lower()):
            continue
        q = f"What did Toby learn about {topic}?"
        if q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
        if len(out) == 3:
            break
    return out


# On Gemini, reasoning_effort="none" keeps thinking tokens from eating max_tokens
# and truncating the answer; OpenAI models omit that param (see _EXTRA_PARAMS).
_GEN_PARAMS = dict(max_tokens=1024, temperature=0.2, **_EXTRA_PARAMS)
# Token counts for the trace arrive in a final usage chunk (OpenAI only).
_STREAM_USAGE = {"stream_options": {"include_usage": True}} if _use_openai else {}


async def stream_rag_query(question: str, history: list[dict] | None = None):
    """Async generator of answer events, so the UI can render while the model
    writes:
      {"type": "sources", "sources": [...], "citations": [...]}   once, before any text
      {"type": "delta", "text": "..."}                            repeatedly
      {"type": "done", "answer", "chunks", "cache_hit", "response_ms",
       "rewritten_question", "trace", "followups"}
    `history` is the session's recent turns ({q, a}); a follow-up is condensed
    into a standalone question before retrieval and the cache lookup.
    Exceptions propagate; the caller turns them into an error event."""
    start = time.time()
    history = history or []
    standalone = await condense(question, history) if history else question
    asked = [t["q"] for t in history] + [question, standalone]
    modules = await _doc_modules()

    def done(answer: str, meta: list[dict], cache_hit, tokens_in=None, tokens_out=None) -> dict:
        ms = round((time.time() - start) * 1000)
        return {"type": "done", "answer": answer, "chunks": meta, "cache_hit": cache_hit, "response_ms": ms,
                "rewritten_question": standalone if standalone != question else None,
                "followups": _followups(meta, answer, asked),
                "trace": {"retrieval": [{"chunk_id": c.get("id"), "heading": c["heading"], "doc_title": c["doc_title"],
                                         "dense_rank": c.get("dense_rank"), "lexical_rank": c.get("lexical_rank"),
                                         "fused_score": c["score"]} for c in meta],
                          "rewritten_question": standalone if standalone != question else None,
                          "cache_hit": cache_hit, "response_ms": ms, "model": RAG_MODEL,
                          "mode": settings.retrieval_mode, "tokens_in": tokens_in, "tokens_out": tokens_out}}

    cached = await get_cached_answer(standalone)
    if cached:
        meta = cached["chunks"]
        yield {"type": "sources", "sources": _sources(meta, modules), "citations": _citations(meta)}
        yield {"type": "delta", "text": cached["answer"]}
        yield done(cached["answer"], meta, "redis")
        return

    chunks = await search(standalone, await embed_query(standalone))
    resume = await get_resume_text()
    overview = await get_overview()
    if not chunks and not resume and not overview:
        yield {"type": "sources", "sources": [], "citations": []}
        yield {"type": "delta", "text": NO_CONTEXT_ANSWER}
        yield done(NO_CONTEXT_ANSWER, [], None)
        return

    meta = _chunk_meta(chunks)
    yield {"type": "sources", "sources": _sources(meta, modules), "citations": _citations(meta)}

    # Retries only cover opening the stream (where 503s/429s surface); once
    # tokens are flowing a failure ends the answer.
    stream = await _complete_with_retry(model=RAG_MODEL,
                                        messages=_llm_messages(question, chunks, resume, overview, history),
                                        stream=True, **_GEN_PARAMS, **_STREAM_USAGE)
    parts, usage = [], None
    async for event in stream:
        if getattr(event, "usage", None):
            usage = event.usage
        delta = event.choices[0].delta.content if event.choices else None
        if delta:
            parts.append(delta)
            yield {"type": "delta", "text": delta}

    answer = "".join(parts)
    await set_cached_answer(standalone, answer, meta)
    yield done(answer, meta, None, getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None))


async def run_rag_query(question: str, history: list[dict] | None = None) -> dict:
    """Non-streaming form: the same pipeline, collected into one result.
    Returns {answer, chunks, sources, response_ms, cache_hit, rewritten_question}."""
    sources = []
    async for event in stream_rag_query(question, history):
        if event["type"] == "sources":
            sources = event["sources"]
        elif event["type"] == "done":
            return {"answer": event["answer"], "chunks": event["chunks"], "sources": sources,
                    "response_ms": event["response_ms"], "cache_hit": event["cache_hit"],
                    "rewritten_question": event["rewritten_question"]}
    raise RuntimeError("RAG stream ended without a result")
