# backend/app/sync/ingestion.py
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from app.sync.google_client import (
    export_doc_as_text,
    list_docs_in_folder,
    get_doc_metadata,
)
from app.rag.chunker import chunk_document
from app.rag.embedder import _encode_texts
from app.rag.retriever import upsert_chunks, delete_chunks_for_doc
from app.config import get_settings

settings = get_settings()

# Only the embedder needs a dedicated thread now — no more Docling/OCR
_embed_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedder")


async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    # Google's native text export — instant, no OCR, no PDF, ~zero memory
    text = await asyncio.to_thread(export_doc_as_text, google_doc_id)
    print(f"[ingest] Exported {len(text)} chars of text from {title}")

    chunks = chunk_document(text=text, doc_id=google_doc_id, doc_title=title)
    print(f"[ingest] {len(chunks)} chunks from {title}")

    if not chunks:
        print(f"[ingest] WARNING: 0 chunks from {title} — doc may be empty")
        return {"doc_id": google_doc_id, "title": title, "chunk_count": 0, "elapsed_ms": 0}

    texts = [c.text for c in chunks]
    loop = asyncio.get_event_loop()
    vectors = await loop.run_in_executor(_embed_executor, _encode_texts, texts)

    embedded_chunks = [
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

    await delete_chunks_for_doc(google_doc_id)
    await upsert_chunks(embedded_chunks)

    elapsed = round((time.time() - start) * 1000)
    print(f"[ingest] Done: {title} — {len(chunks)} chunks in {elapsed}ms")
    return {"doc_id": google_doc_id, "title": title, "chunk_count": len(chunks), "elapsed_ms": elapsed}


async def list_documents() -> list[dict]:
    return await asyncio.to_thread(list_docs_in_folder, settings.google_drive_folder_id)