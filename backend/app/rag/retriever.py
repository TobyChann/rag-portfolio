# backend/app/rag/retriever.py
import asyncio
import re
from concurrent.futures import ThreadPoolExecutor
from pymilvus import MilvusClient, DataType
from app.config import get_settings
from app.rag import pg_chunks

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


_DOC_ID = re.compile(r"^[\w-]+$")   # Google Doc ids; anything else never reaches a filter


async def retrieve(query_vector: list[float], top_k: int = TOP_K, doc_id: str | None = None) -> list[dict]:
    """`doc_id` limits the search to one note."""
    if doc_id and not _DOC_ID.match(doc_id):
        return []
    client = get_client()
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        _zilliz_executor,
        lambda: client.search(
            collection_name=settings.zilliz_collection,
            data=[query_vector],
            limit=top_k,
            filter=f'doc_id == "{doc_id}"' if doc_id else "",
            output_fields=["text", "doc_id", "doc_title", "heading", "chunk_index"],
        )
    )
    return [
        {
            "id": hit["id"],
            "text": hit["entity"]["text"],
            "doc_title": hit["entity"]["doc_title"],
            "heading": hit["entity"]["heading"],
            "doc_id": hit["entity"]["doc_id"],
            "chunk_index": hit["entity"]["chunk_index"],
            "score": round(hit["distance"], 3),
        }
        for hit in results[0]
    ]


RRF_K = 60
CANDIDATES = 20


async def search(question: str, vector: list[float], mode: str | None = None,
                 top_k: int = TOP_K, doc_id: str | None = None) -> list[dict]:
    """Retrieval as configured by `mode` (default: settings.retrieval_mode):
      dense      Zilliz ANN only
      pg_dense   pgvector only (benchmark against Zilliz)
      hybrid     Zilliz + Postgres full-text, fused by Reciprocal Rank Fusion
      pg_hybrid  pgvector + full-text, fused the same way
    Hybrid modes also pull in the top hit's neighbouring chunk under the same
    heading. Each result carries dense_rank / lexical_rank (1-based or None).
    `doc_id` restricts every backend to one note ("Ask about this note")."""
    mode = mode or settings.retrieval_mode
    if mode == "dense":
        hits = await retrieve(vector, top_k, doc_id)
        return [{**h, "dense_rank": i + 1, "lexical_rank": None} for i, h in enumerate(hits)]
    if mode == "pg_dense":
        hits = await pg_chunks.dense_search(vector, top_k, doc_id)
        return [{**h, "score": round(h["score"], 3), "dense_rank": i + 1, "lexical_rank": None}
                for i, h in enumerate(hits)]

    dense_fn = (retrieve(vector, CANDIDATES, doc_id) if mode == "hybrid"
                else pg_chunks.dense_search(vector, CANDIDATES, doc_id))
    dense, lexical = await asyncio.gather(dense_fn, pg_chunks.lexical_search(question, CANDIDATES, doc_id))

    fused: dict[str, dict] = {}
    for key, ranked in (("dense_rank", dense), ("lexical_rank", lexical)):
        for rank, hit in enumerate(ranked, 1):
            entry = fused.setdefault(hit["id"], {**hit, "score": 0.0, "dense_rank": None, "lexical_rank": None})
            entry[key] = rank
            entry["score"] += 1 / (RRF_K + rank)
    top = sorted(fused.values(), key=lambda h: h["score"], reverse=True)[:top_k]
    for h in top:
        h["score"] = round(h["score"], 4)

    if top:
        have = {h["id"] for h in top}
        first = top[0]
        for n in await pg_chunks.neighbours(first["doc_id"], first["chunk_index"], first["heading"]):
            if n["id"] not in have:
                top.append({**n, "dense_rank": None, "lexical_rank": None})
    return top


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
