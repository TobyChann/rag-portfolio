# backend/app/rag/pipeline.py
import time
from openai import AsyncOpenAI
from app.rag.embedder import embed_query
from app.rag.retriever import retrieve
from app.cache.query_cache import get_cached_answer, set_cached_answer
from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(
    api_key=settings.gemini_api_key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

RAG_MODEL = settings.rag_model


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

    # 5. Generate the answer.
    # reasoning_effort="none" is critical on Gemini 2.5: thinking tokens count
    # against max_tokens and were truncating visitor answers mid-sentence.
    response = await client.chat.completions.create(
        model=RAG_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
        max_tokens=1024,
        temperature=0.2,  # Low temp = more factual, less creative
        reasoning_effort="none",
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