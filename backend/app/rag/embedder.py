# backend/app/rag/embedder.py
import asyncio
from sentence_transformers import SentenceTransformer
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
    """Synchronous batch encode. Run it off the event loop (ingestion uses a
    dedicated single-thread executor so model use never overlaps)."""
    return get_model().encode(texts, batch_size=32, show_progress_bar=False)


def _encode_single(text: str):
    return get_model().encode(text)


async def embed_query(question: str) -> list[float]:
    """Embed a single query string. Safe to call from the event loop."""
    vector = await asyncio.to_thread(_encode_single, question)
    return vector.tolist()