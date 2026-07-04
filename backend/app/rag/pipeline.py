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

SYSTEM_PROMPT = """You are a helpful assistant representing a job candidate's portfolio.
Answer questions about their skills, coursework, and experience using only the provided context.
Be concise, professional, and specific. If the context doesn't contain relevant information,
say so honestly rather than making things up.
Always refer to the candidate in third person (e.g. "They studied...", "Their experience includes...").
"""


async def run_rag_query(question: str) -> dict:
    """
    Full RAG pipeline:
    1. Check Redis cache (exact match)
    2. Embed question
    3. Retrieve relevant chunks from Zilliz
    4. Generate answer with GPT-4o-mini
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
            "response_ms": round((time.time() - start) * 1000),
            "cache_hit": None,
        }

    # 4. Build context from chunks
    context = "\n\n---\n\n".join(
        f"[From: {c['doc_title']} — {c['heading']}]\n{c['text']}"
        for c in chunks
    )

    # 5. Call GPT-4o-mini
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
        max_tokens=500,
        temperature=0.2,  # Low temp = more factual, less creative
    )

    answer = response.choices[0].message.content
    elapsed = round((time.time() - start) * 1000)

    # 6. Cache for next time
    chunk_meta = [{"doc_title": c["doc_title"], "heading": c["heading"], "score": c["score"]} for c in chunks]
    await set_cached_answer(question, answer, chunk_meta)

    return {
        "answer": answer,
        "chunks": chunk_meta,
        "response_ms": elapsed,
        "cache_hit": None,
    }