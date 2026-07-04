# backend/app/rag/embedder.py
import asyncio
from sentence_transformers import SentenceTransformer
from app.rag.chunker import Chunk
from app.config import get_settings

settings = get_settings()

_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("[embedder] Loading sentence-transformers model...")
        # all-MiniLM-L6-v2 is a public model
        _model = SentenceTransformer("all-MiniLM-L6-v2", token=settings.hf_token)
        print("[embedder] Model loaded")
    return _model


def _encode_texts(texts: list[str]):
    """Synchronous encode — must be called from a thread, not the event loop directly."""
    return get_model().encode(texts, batch_size=32, show_progress_bar=False)


def _encode_single(text: str):
    return get_model().encode(text)


# NOTE: These functions are designed to be called with asyncio.to_thread() from
# ingest_document / the query pipeline. Do NOT wrap them in another to_thread
# internally — that causes nested thread exhaustion on the second document.

async def embed_chunks(chunks: list[Chunk]) -> list[dict]:
    """
    Embed a list of chunks. Call this directly with await — it runs the CPU-bound
    encode synchronously (assumes it's already being called from a thread context
    via ingest_document's asyncio.to_thread wrapper).
    
    If calling from the async event loop directly (not from inside a thread),
    use: await asyncio.to_thread(embed_chunks_sync, chunks)
    """
    texts = [c.text for c in chunks]
    # Direct synchronous call — no nested to_thread
    vectors = _encode_texts(texts)
    return [
        {
            "id": f"{chunk.doc_id}_{chunk.chunk_index}",
            "vector": vector.tolist(),
            "text": chunk.text,
            "doc_id": chunk.doc_id,
            "doc_title": chunk.doc_title,
            "heading": chunk.heading,
            "chunk_index": chunk.chunk_index,
        }
        for chunk, vector in zip(chunks, vectors)
    ]


async def embed_query(question: str) -> list[float]:
    """Embed a single query string. Safe to call from the event loop."""
    vector = await asyncio.to_thread(_encode_single, question)
    return vector.tolist()