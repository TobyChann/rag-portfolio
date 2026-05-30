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
        
        _model = SentenceTransformer(
            "all-MiniLM-L6-v2",
            token=settings.hf_token
        )
        print("[embedder] Model loaded")
    return _model

def _encode_texts(texts: list[str]):
    return get_model().encode(texts, batch_size=32, show_progress_bar=True)

async def embed_chunks(chunks: list[Chunk]) -> list[dict]:
    texts = [c.text for c in chunks]
    vectors = await asyncio.to_thread(_encode_texts, texts)
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
    vector = await asyncio.to_thread(get_model().encode, question)
    return vector.tolist()