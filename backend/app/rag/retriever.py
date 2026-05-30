import asyncio
from pymilvus import MilvusClient, DataType
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
        _ensure_collection(_client)
    return _client


def _ensure_index(client: MilvusClient):
    """Create vector index if missing (handles collections created before the index fix)."""
    try:
        existing = client.list_indexes(settings.zilliz_collection)
        has_vector_idx = any(
            (idx.get("field_name") or idx.get("fieldName", "")) == "vector"
            for idx in existing
        )
        if not has_vector_idx:
            index_params = client.prepare_index_params()
            index_params.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
            client.create_index(collection_name=settings.zilliz_collection, index_params=index_params)
            client.load_collection(settings.zilliz_collection)
            print(f"[retriever] Created missing index on existing collection")
    except Exception as e:
        print(f"[retriever] Warning: could not verify/create index: {e}")


def _ensure_collection(client: MilvusClient):
    """Create collection + index if needed; ensure index on existing collections."""
    if not client.has_collection(settings.zilliz_collection):
        schema = client.create_schema(auto_id=False)
        schema.add_field(field_name="id",          datatype=DataType.VARCHAR,      is_primary=True, max_length=200)
        schema.add_field(field_name="vector",       datatype=DataType.FLOAT_VECTOR, dim=VECTOR_DIM)
        schema.add_field(field_name="text",         datatype=DataType.VARCHAR,      max_length=4000)
        schema.add_field(field_name="doc_id",       datatype=DataType.VARCHAR,      max_length=200)
        schema.add_field(field_name="doc_title",    datatype=DataType.VARCHAR,      max_length=500)
        schema.add_field(field_name="heading",      datatype=DataType.VARCHAR,      max_length=500)
        schema.add_field(field_name="chunk_index",  datatype=DataType.INT64)
        client.create_collection(
            collection_name=settings.zilliz_collection,
            dimension=VECTOR_DIM,
            metric_type="COSINE",
            schema=schema,
        )
        index_params = client.prepare_index_params()
        index_params.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
        client.create_index(collection_name=settings.zilliz_collection, index_params=index_params)
        client.load_collection(settings.zilliz_collection)
        print(f"[retriever] Created collection + index: {settings.zilliz_collection}")
    else:
        _ensure_index(client)


async def upsert_chunks(embedded_chunks: list[dict]):
    client = get_client()
    await asyncio.to_thread(client.upsert, collection_name=settings.zilliz_collection, data=embedded_chunks)
    print(f"[retriever] Upserted {len(embedded_chunks)} chunks")


async def delete_chunks_for_doc(doc_id: str):
    client = get_client()
    await asyncio.to_thread(client.delete, collection_name=settings.zilliz_collection, filter=f'doc_id == "{doc_id}"')
    print(f"[retriever] Deleted old chunks for doc: {doc_id}")


async def retrieve(query_vector: list[float], top_k: int = TOP_K) -> list[dict]:
    client = get_client()
    results = await asyncio.to_thread(
        client.search,
        collection_name=settings.zilliz_collection,
        data=[query_vector],
        limit=top_k,
        output_fields=["text", "doc_id", "doc_title", "heading", "chunk_index"],
    )
    return [
        {
            "text": hit["entity"]["text"],
            "doc_title": hit["entity"]["doc_title"],
            "heading": hit["entity"]["heading"],
            "doc_id": hit["entity"]["doc_id"],
            "score": round(hit["distance"], 3),
        }
        for hit in results[0]
    ]
