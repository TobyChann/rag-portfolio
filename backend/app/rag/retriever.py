# backend/app/rag/retriever.py
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pymilvus import MilvusClient, DataType
from app.config import get_settings

settings = get_settings()
_client = None

_zilliz_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="zilliz")

VECTOR_DIM = 384
TOP_K = 5


def get_client() -> MilvusClient:
    global _client
    if _client is None:
        _client = MilvusClient(
            uri=settings.zilliz_uri,
            token=settings.zilliz_token,
        )
        _ensure_collection(_client)
    return _client


def _ensure_collection(client: MilvusClient):
    index_params = client.prepare_index_params()
    index_params.add_index(
        field_name="vector",
        index_type="AUTOINDEX",
        metric_type="COSINE"
    )

    if not client.has_collection(settings.zilliz_collection):
        schema = client.create_schema(auto_id=False)
        schema.add_field(field_name="id",          datatype=DataType.VARCHAR,      is_primary=True, max_length=200)
        schema.add_field(field_name="vector",      datatype=DataType.FLOAT_VECTOR, dim=VECTOR_DIM)
        schema.add_field(field_name="text",        datatype=DataType.VARCHAR,      max_length=4000)
        schema.add_field(field_name="doc_id",      datatype=DataType.VARCHAR,      max_length=200)
        schema.add_field(field_name="doc_title",   datatype=DataType.VARCHAR,      max_length=500)
        schema.add_field(field_name="heading",     datatype=DataType.VARCHAR,      max_length=500)
        schema.add_field(field_name="chunk_index", datatype=DataType.INT64)

        client.create_collection(
            collection_name=settings.zilliz_collection,
            schema=schema,
            index_params=index_params
        )
        print(f"[retriever] Created collection + index: {settings.zilliz_collection}")
    else:
        try:
            existing = client.list_indexes(settings.zilliz_collection)
            # list_indexes returns list of index names (strings) in newer pymilvus
            indexed_fields = set()
            for item in existing:
                if isinstance(item, str):
                    indexed_fields.add(item)
                elif isinstance(item, dict):
                    indexed_fields.add(item.get("field_name") or item.get("fieldName", ""))

            if "vector" not in indexed_fields:
                print("[retriever] Vector index missing — creating it now")
                client.create_index(
                    collection_name=settings.zilliz_collection,
                    index_params=index_params
                )
        except Exception as e:
            print(f"[retriever] Warning: could not verify/create index: {e}")

        client.load_collection(settings.zilliz_collection)
        print(f"[retriever] Collection loaded: {settings.zilliz_collection}")


async def upsert_chunks(embedded_chunks: list[dict]):
    client = get_client()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _zilliz_executor,
        lambda: client.upsert(collection_name=settings.zilliz_collection, data=embedded_chunks)
    )
    print(f"[retriever] Upserted {len(embedded_chunks)} chunks")


async def delete_chunks_for_doc(doc_id: str):
    client = get_client()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _zilliz_executor,
        lambda: client.delete(collection_name=settings.zilliz_collection, filter=f'doc_id == "{doc_id}"')
    )
    print(f"[retriever] Deleted old chunks for doc: {doc_id}")


async def retrieve(query_vector: list[float], top_k: int = TOP_K) -> list[dict]:
    client = get_client()
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        _zilliz_executor,
        lambda: client.search(
            collection_name=settings.zilliz_collection,
            data=[query_vector],
            limit=top_k,
            output_fields=["text", "doc_id", "doc_title", "heading", "chunk_index"],
        )
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


async def keep_alive() -> None:
    """One tiny real read so the cluster registers activity. Free-tier Zilliz
    clusters are stopped after a stretch of inactivity; a scheduled sync calls
    this so the cluster stays up even when no notes changed."""
    client = get_client()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _zilliz_executor,
        lambda: client.query(collection_name=settings.zilliz_collection,
                             filter="chunk_index >= 0", output_fields=["doc_id"], limit=1),
    )
