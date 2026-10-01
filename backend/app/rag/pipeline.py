# backend/app/rag/pipeline.py
import asyncio
import time
from openai import AsyncOpenAI
from app.rag.embedder import embed_query
from app.rag.retriever import retrieve
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

SYSTEM_PROMPT = """You are a helpful assistant representing a job candidate's portfolio.
Answer questions about their skills, coursework, and experience using only the provided context.
If the context doesn't contain relevant information, say so honestly rather than making things up.
Always refer to the candidate in third person (e.g. "They studied...", "Their experience includes...").

Style — keep it skimmable, not verbose:
- Open with one short sentence answering the question directly (max ~20 words).
- Then give the specifics as bullet points, one per line, each starting with "- ".
- Keep each bullet to a single tight line. Aim for 2-5 bullets; fewer is fine.
- Do NOT use other markdown (no **, *, #, tables). Plain text with "- " bullets only.
- Don't repeat the question or pad with filler. If one sentence fully answers it, skip the bullets.
"""


async def run_rag_query(question: str) -> dict:
    """
    Full RAG pipeline:
    1. Check Redis cache (exact match)
    2. Embed question
    3. Retrieve relevant chunks from Zilliz
    4. Generate answer (thinking disabled — factual extraction, not reasoning)
    5. Cache result
    Returns {answer, chunks, response_ms, cache_hit}
    """
    start = time.time()

    # 1. Check cache first
    cached = await get_cached_answer(question)
    if cached:
        return {
            "answer": cached["answer"],
            "chunks": cached["chunks"],
            "sources": _sources_from_chunks(cached["chunks"]),
            "response_ms": 0,
            "cache_hit": "redis",
        }

    # 2. Embed the question
    query_vector = await embed_query(question)

    # 3. Retrieve relevant chunks
    chunks = await retrieve(query_vector)

    if not chunks:
        return {
            "answer": "I couldn't find relevant information about that in the portfolio documents.",
            "chunks": [],
            "sources": [],
            "response_ms": round((time.time() - start) * 1000),
            "cache_hit": None,
        }

    # 4. Build context from chunks
    context = "\n\n---\n\n".join(
        f"[From: {c['doc_title']} — {c['heading']}]\n{c['text']}"
        for c in chunks
    )

    # 5. Generate the answer. On Gemini, reasoning_effort="none" keeps thinking
    # tokens from eating max_tokens and truncating the answer; OpenAI models omit
    # that param (see _EXTRA_PARAMS). Retries ride out transient 503 spikes.
    response = await _complete_with_retry(
        model=RAG_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
        max_tokens=1024,
        temperature=0.2,  # Low temp = more factual, less creative
        **_EXTRA_PARAMS,
    )

    answer = response.choices[0].message.content
    elapsed = round((time.time() - start) * 1000)

    # 6. Cache for next time. Keep doc_id so cached answers can still link sources.
    chunk_meta = [
        {"doc_id": c["doc_id"], "doc_title": c["doc_title"], "heading": c["heading"], "score": c["score"]}
        for c in chunks
    ]
    await set_cached_answer(question, answer, chunk_meta)

    return {
        "answer": answer,
        "chunks": chunk_meta,
        "sources": _sources_from_chunks(chunk_meta),
        "response_ms": elapsed,
        "cache_hit": None,
    }