import asyncio
import tempfile
import os
import time
from docling.document_converter import DocumentConverter
from app.sync.google_client import export_doc_as_pdf, list_docs_in_folder, get_doc_metadata
from app.rag.chunker import chunk_document
from app.rag.embedder import embed_chunks
from app.rag.retriever import upsert_chunks, delete_chunks_for_doc
from app.config import get_settings

settings = get_settings()
converter = DocumentConverter()


async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    # Export PDF in thread (sync HTTP call)
    pdf_bytes = await asyncio.to_thread(export_doc_as_pdf, google_doc_id)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        # Parse with Docling in thread (CPU-bound)
        result = await asyncio.to_thread(converter.convert, tmp_path)
        doc_markdown = result.document.export_to_markdown()

        chunks = chunk_document(text=doc_markdown, doc_id=google_doc_id, doc_title=title)
        print(f"[ingest] {len(chunks)} chunks from {title}")

        # Embed in thread (CPU-bound, already uses asyncio.to_thread internally)
        embedded_chunks = await embed_chunks(chunks)

        await delete_chunks_for_doc(google_doc_id)
        await upsert_chunks(embedded_chunks)

        elapsed = round((time.time() - start) * 1000)
        print(f"[ingest] Done: {title} in {elapsed}ms")
        return {"doc_id": google_doc_id, "title": title, "chunk_count": len(chunks), "elapsed_ms": elapsed}
    finally:
        os.unlink(tmp_path)


async def list_documents() -> list[dict]:
    return await asyncio.to_thread(list_docs_in_folder, settings.google_drive_folder_id)