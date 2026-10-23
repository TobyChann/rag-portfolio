# backend/app/sync/backfill_chunks.py
"""Fill the Postgres `chunks` mirror from what's already in Zilliz, without
re-parsing anything through Gemini:  python -m app.sync.backfill_chunks

Vectors are copied from Zilliz rather than re-embedded, so pgvector and Zilliz
hold identical embeddings (a fair benchmark) and no model load is needed."""
import asyncio

from sqlalchemy import select

from app.config import get_settings
from app.db.database import AsyncSessionLocal, init_db
from app.db.models import Document
from app.rag.pg_chunks import replace_doc_chunks
from app.rag.retriever import get_client

FIELDS = ["id", "vector", "text", "heading", "chunk_index", "doc_id"]


async def main():
    await init_db()
    async with AsyncSessionLocal() as db:
        docs = (await db.execute(select(Document.google_doc_id, Document.title))).all()

    client = get_client()
    collection = get_settings().zilliz_collection
    total = 0
    for g, title in docs:
        rows = await asyncio.to_thread(
            client.query, collection_name=collection, filter=f'doc_id == "{g}"',
            output_fields=FIELDS, limit=16384)
        rows.sort(key=lambda r: r["chunk_index"])
        await replace_doc_chunks(g, rows)
        total += len(rows)
        print(f"[backfill] {title}: {len(rows)} chunks")
    print(f"[backfill] {total} chunks across {len(docs)} docs")


if __name__ == "__main__":
    asyncio.run(main())
