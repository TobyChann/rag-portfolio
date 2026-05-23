from pymilvus import MilvusClient
from app.config import get_settings

settings = get_settings()
_client = None

VECTOR_DIM = 384    # all-MiniLM-L6-v2 output dimension
TOP_K = 5           # chunks to retrieve per query


def get_client() -> MilvusClient:
    global _client
    if _client is None:
        _client = MilvusClient(
            uri=settings.zilliz_uri,
            token=settings.zilliz_token,
        )
        _ensure_collection()
    return _client


def _ensure_collection():
    """Create collection if it doesn't exist."""
    client = MilvusClient(
        uri=settings.zilliz_uri,
        token=settings.zilliz_token,
    )
    if not client.has_collection(settings.zilliz_collection):
        client.create_collection(
            collection_name=settings.zilliz_collection,
            dimension=VECTOR_DIM,
            metric_type="COSINE",
            # Extra fields stored alongside vectors
            schema=client.create_schema(auto_id=False).add_field(
                field_name="id", datatype="VarChar", is_primary=True, max_length=200
            ).add_field(
                field_name="vector", datatype="FloatVector", dim=VECTOR_DIM
            ).add_field(
                field_name="text", datatype="VarChar", max_length=4000
            ).add_field(
                field_name="doc_id", datatype="VarChar", max_length=200
            ).add_field(
                field_name="doc_title", datatype="VarChar", max_length=500
            ).add_field(
                field_name="heading", datatype="VarChar", max_length=500
            ).add_field(
                field_name="chunk_index", datatype="Int64"
            )
        )
        print(f"[retriever] Created collection: {settings.zilliz_collection}")


async def upsert_chunks(embedded_chunks: list[dict]):
    """Insert or update chunks in Zilliz."""
    client = get_client()
    client.upsert(
        collection_name=settings.zilliz_collection,
        data=embedded_chunks,
    )
    print(f"[retriever] Upserted {len(embedded_chunks)} chunks")


async def delete_chunks_for_doc(doc_id: str):
    """Remove all existing chunks for a document before re-indexing."""
    client = get_client()
    client.delete(
        collection_name=settings.zilliz_collection,
        filter=f'doc_id == "{doc_id}"',
    )
    print(f"[retriever] Deleted old chunks for doc: {doc_id}")


async def retrieve(query_vector: list[float], top_k: int = TOP_K) -> list[dict]:
    """
    Search Zilliz for the most relevant chunks.
    Returns list of {text, doc_title, heading, score}.
    """
    client = get_client()
    results = client.search(
        collection_name=settings.zilliz_collection,
        data=[query_vector],
        limit=top_k,
        output_fields=["text", "doc_id", "doc_title", "heading", "chunk_index"],
    )
    chunks = []
    for hit in results[0]:
        chunks.append({
            "text": hit["entity"]["text"],
            "doc_title": hit["entity"]["doc_title"],
            "heading": hit["entity"]["heading"],
            "doc_id": hit["entity"]["doc_id"],
            "score": round(hit["distance"], 3),
        })
    return chunks
