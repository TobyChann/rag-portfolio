# backend/app/sync/ingestion.py
import asyncio
import tempfile
import os
import time
from concurrent.futures import ThreadPoolExecutor
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from app.sync.google_client import export_doc_as_pdf, list_docs_in_folder, get_doc_metadata
from app.rag.chunker import chunk_document
from app.rag.embedder import _encode_texts
from app.rag.retriever import upsert_chunks, delete_chunks_for_doc
from app.config import get_settings

settings = get_settings()

_pipeline_options = PdfPipelineOptions()
_pipeline_options.do_ocr = True
_pipeline_options.do_table_structure = True

converter = DocumentConverter(
    format_options={
        "pdf": PdfFormatOption(pipeline_options=_pipeline_options)
    }
)

# Dedicated executors — Docling and embedder on separate threads so they
# never compete for pool slots and cannot deadlock each other
_docling_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="docling")
_embed_executor   = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedder")


async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    pdf_bytes = await asyncio.to_thread(export_doc_as_pdf, google_doc_id)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()

        # Docling parse — CPU-bound, dedicated executor
        result = await loop.run_in_executor(
            _docling_executor,
            lambda: converter.convert(tmp_path)
        )
        doc_markdown = result.document.export_to_markdown()
        print(f"[ingest] Parsed {title} — {len(doc_markdown)} chars of markdown")

        chunks = chunk_document(text=doc_markdown, doc_id=google_doc_id, doc_title=title)
        print(f"[ingest] {len(chunks)} chunks from {title}")

        if not chunks:
            print(f"[ingest] WARNING: 0 chunks from {title} — doc may be empty or image-only with no OCR output")
            return {"doc_id": google_doc_id, "title": title, "chunk_count": 0, "elapsed_ms": 0}

        # Embed — CPU-bound, dedicated executor
        texts = [c.text for c in chunks]
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

    except Exception as e:
        print(f"[ingest] ERROR on {title}: {e}")
        raise
    finally:
        os.unlink(tmp_path)


async def list_documents() -> list[dict]:
    return await asyncio.to_thread(list_docs_in_folder, settings.google_drive_folder_id)