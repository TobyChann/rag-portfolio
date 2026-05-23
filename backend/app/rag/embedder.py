from sentence_transformers import SentenceTransformer
from app.rag.chunker import Chunk

# Load once at module level — stays in memory
# all-MiniLM-L6-v2: fast, good quality, 384 dimensions, free
_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("[embedder] Loading sentence-transformers model...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        print("[embedder] Model loaded")
    return _model


async def embed_chunks(chunks: list[Chunk]) -> list[dict]:
    """
    Embed a list of Chunk objects.
    Returns list of dicts ready for Zilliz upsert.
    """
    model = get_model()
    texts = [c.text for c in chunks]

    # Batch embed (much faster than one-by-one)
    vectors = model.encode(texts, batch_size=32, show_progress_bar=True)

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
    """Embed a single query string for retrieval."""
    model = get_model()
    vector = model.encode(question)
    return vector.tolist()
