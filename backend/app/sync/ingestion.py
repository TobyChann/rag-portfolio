# backend/app/sync/ingestion.py
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from google import genai
from google.genai import types

from app.sync.google_client import (
    export_doc_as_text,
    export_doc_as_pdf,
    doc_has_images,
    list_docs_in_folder,
    list_all_files_in_folder,
    get_doc_metadata,
)
from app.rag.chunker import chunk_document
from app.rag.embedder import _encode_texts
from app.rag.retriever import upsert_chunks, delete_chunks_for_doc
from app.config import get_settings

settings = get_settings()

_embed_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedder")

# Native GenAI client, used ONLY for multimodal PDF parsing — the OpenAI-compat
# endpoint doesn't cleanly take application/pdf. Text chat stays on the compat client.
_genai = genai.Client(api_key=settings.gemini_api_key)

_PARSE_PROMPT = (
    "Convert this document to clean Markdown. Transcribe ALL text faithfully, "
    "including text inside images, diagrams, and screenshots. Infer heading levels "
    "(#, ##, ###) from the visual layout and font sizes. Do not summarise, add, or "
    "omit anything. Output only Markdown."
)


def _parse_pdf_to_markdown(pdf_bytes: bytes, title: str) -> str:
    resp = _genai.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            _PARSE_PROMPT,
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,
            thinking_config=types.ThinkingConfig(thinking_budget=0),  # extraction, not reasoning
        ),
    )
    return resp.text or ""


async def _resolve_text(google_doc_id: str, title: str) -> str:
    """Text-only docs → instant export. Image-bearing docs → PDF → Gemini markdown
    (captures image-text + infers headings). For always-parse, drop the has_images guard."""
    has_images = await asyncio.to_thread(doc_has_images, google_doc_id)
    if not has_images:
        text = await asyncio.to_thread(export_doc_as_text, google_doc_id)
        print(f"[ingest] {title}: text export ({len(text)} chars)")
        return text
    pdf = await asyncio.to_thread(export_doc_as_pdf, google_doc_id)
    md = await asyncio.to_thread(_parse_pdf_to_markdown, pdf, title)
    print(f"[ingest] {title}: multimodal parse ({len(md)} chars, image-text captured)")
    return md


async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    text = await _resolve_text(google_doc_id, title)

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


async def list_all_files() -> list[dict]:
    return await asyncio.to_thread(list_all_files_in_folder, settings.google_drive_folder_id)