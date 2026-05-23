import tempfile
import os
import time
from pathlib import Path
from docling.document_converter import DocumentConverter
from app.sync.google_client import export_doc_as_pdf, list_docs_in_folder, get_doc_metadata
from app.rag.chunker import chunk_document
from app.rag.embedder import embed_chunks
from app.rag.retriever import upsert_chunks, delete_chunks_for_doc
from app.config import get_settings

settings = get_settings()
converter = DocumentConverter()


async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    """
    Full pipeline for one document:
    1. Export from Google Docs as PDF
    2. Parse with Docling (handles images + text)
    3. Chunk intelligently
    4. Embed with HuggingFace
    5. Upsert into Zilliz
    Returns metadata about what was indexed.
    """
    start = time.time()

    # 1. Get metadata if title not provided
    if not title:
        meta = get_doc_metadata(google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    # 2. Export as PDF (preserves images + formatting)
    pdf_bytes = export_doc_as_pdf(google_doc_id)

    # 3. Write to temp file for Docling
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        # 4. Parse with Docling
        result = converter.convert(tmp_path)
        doc_markdown = result.document.export_to_markdown()

        # 5. Chunk the document
        chunks = chunk_document(
            text=doc_markdown,
            doc_id=google_doc_id,
            doc_title=title,
        )
        print(f"[ingest] {len(chunks)} chunks created")

        # 6. Embed chunks
        embedded_chunks = await embed_chunks(chunks)

        # 7. Delete old vectors for this doc, insert fresh
        await delete_chunks_for_doc(google_doc_id)
        await upsert_chunks(embedded_chunks)

        elapsed = round((time.time() - start) * 1000)
        print(f"[ingest] Done: {title} in {elapsed}ms")

        return {
            "doc_id": google_doc_id,
            "title": title,
            "chunk_count": len(chunks),
            "elapsed_ms": elapsed,
        }
    finally:
        os.unlink(tmp_path)


async def ingest_all_documents() -> list[dict]:
    """Ingest every doc in the configured Drive folder."""
    docs = list_docs_in_folder(settings.google_drive_folder_id)
    print(f"[ingest] Found {len(docs)} documents in Drive folder")
    results = []
    for doc in docs:
        result = await ingest_document(doc["id"], doc["name"])
        results.append(result)
    return results