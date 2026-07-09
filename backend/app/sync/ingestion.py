# backend/app/sync/ingestion.py
import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor

from openai import AsyncOpenAI
from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.sql import func as sa_func

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
from app.db.database import AsyncSessionLocal
from app.db.models import Document, Skill
from app.config import get_settings

settings = get_settings()

_embed_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedder")

# Native GenAI client, used ONLY for multimodal PDF parsing — the OpenAI-compat
# endpoint doesn't cleanly take application/pdf. Text chat stays on the compat client.
_genai = genai.Client(api_key=settings.gemini_api_key)

# OpenAI-compat client for text-only tag/summary generation.
_llm = AsyncOpenAI(
    api_key=settings.gemini_api_key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

TAG_MODEL = "gemini-2.5-flash"

_PARSE_PROMPT = (
    "Convert this document to clean Markdown. Transcribe ALL text faithfully, "
    "including text inside images, diagrams, and screenshots. Infer heading levels "
    "(#, ##, ###) from the visual layout and font sizes. Do not summarise, add, or "
    "omit anything. Output only Markdown."
)

_TAG_SYSTEM = (
    "You extract portfolio metadata from a student's course notes. "
    "Given a document, return STRICT JSON with exactly two keys:\n"
    '  "summary": 2-3 professional sentences describing what the notes cover and the '
    "skills or knowledge they demonstrate (employer-facing, third person not needed, "
    "no 'this document' openings).\n"
    '  "skills": an array of 3-10 short skill names an employer would recognise '
    '(e.g. "SQL", "Credit risk modelling", "Pandas"). Use canonical names, no duplicates, '
    "no soft skills unless clearly demonstrated.\n"
    "Return only the JSON object, nothing else."
)


# ── Text resolution (parse step) ─────────────────────────

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


async def resolve_doc_text(google_doc_id: str, title: str) -> str:
    """Text-only docs → instant export. Image-bearing docs → PDF → Gemini markdown
    (captures image-text + infers headings). For always-parse, drop the has_images guard.
    Public: also used by the admin generate-tags endpoint."""
    has_images = await asyncio.to_thread(doc_has_images, google_doc_id)
    if not has_images:
        text = await asyncio.to_thread(export_doc_as_text, google_doc_id)
        print(f"[ingest] {title}: text export ({len(text)} chars)")
        return text
    pdf = await asyncio.to_thread(export_doc_as_pdf, google_doc_id)
    md = await asyncio.to_thread(_parse_pdf_to_markdown, pdf, title)
    print(f"[ingest] {title}: multimodal parse ({len(md)} chars, image-text captured)")
    return md


# ── Tag / summary generation ─────────────────────────────

async def generate_doc_tags(text: str, title: str) -> dict:
    """One LLM call → {"summary": str, "skills": [str]}. Raises on failure;
    callers decide whether that's fatal (admin button) or soft (auto-ingest)."""
    resp = await _llm.chat.completions.create(
        model=TAG_MODEL,
        messages=[
            {"role": "system", "content": _TAG_SYSTEM},
            {"role": "user", "content": f"Document title: {title}\n\n{text[:100_000]}"},
        ],
        max_tokens=1024,
        temperature=0.2,
        reasoning_effort="none",
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content)
    skills = [s.strip() for s in data.get("skills", []) if isinstance(s, str) and s.strip()]
    return {"summary": (data.get("summary") or "").strip(), "skills": skills[:12]}


async def add_skills_to_inventory(db, names: list[str]) -> int:
    """Upsert skill names into the inventory, case-insensitively deduped.
    New rows land with category=None (off the public diagram until categorised)."""
    if not names:
        return 0
    result = await db.execute(select(Skill))
    have = {s.name.lower() for s in result.scalars().all()}
    created = 0
    for name in names:
        if name.lower() not in have:
            db.add(Skill(name=name, category=None, achieved=True))
            have.add(name.lower())
            created += 1
    return created


async def _persist_document(google_doc_id: str, title: str, chunk_count: int, text: str):
    """Upsert the Document row. INSERT path: auto-generate tags + push skills into
    the inventory (agreed rule: auto on insert). UPDATE path: metadata only —
    the webhook owns needs_review, and tags are regenerated via the admin queue."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
        doc = result.scalar_one_or_none()
        is_new = doc is None

        if is_new:
            doc = Document(google_doc_id=google_doc_id, title=title, chunk_count=chunk_count)
            db.add(doc)
        else:
            doc.title = title
            doc.chunk_count = chunk_count
        doc.last_synced_at = sa_func.now()

        if is_new:
            try:
                tags = await generate_doc_tags(text, title)
                doc.summary = tags["summary"]
                doc.skills = tags["skills"]
                doc.tag_status = "approved"   # auto on insert; editable any time
                n = await add_skills_to_inventory(db, tags["skills"])
                print(f"[ingest] {title}: tagged ({len(tags['skills'])} skills, {n} new in inventory)")
            except Exception as e:
                # Soft-fail: doc stays tag_status='pending' and shows in the review
                # queue where the generate button can retry.
                print(f"[ingest] Tagging failed for {title}: {e} — left pending")

        await db.commit()


# ── Main ingestion ───────────────────────────────────────

async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    text = await resolve_doc_text(google_doc_id, title)

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

    # Persist the Document row (+ auto-tag if this is a first-time insert)
    try:
        await _persist_document(google_doc_id, title, len(chunks), text)
    except Exception as e:
        print(f"[ingest] Document row persist failed for {title}: {e}")

    elapsed = round((time.time() - start) * 1000)
    print(f"[ingest] Done: {title} — {len(chunks)} chunks in {elapsed}ms")
    return {"doc_id": google_doc_id, "title": title, "chunk_count": len(chunks), "elapsed_ms": elapsed}

async def sync_changed_documents() -> dict:
    """Delta sync: ingest new docs, re-ingest changed ones (modifiedTime vs
    last_synced_at), skip the rest. Changed existing docs get needs_review=True."""
    from datetime import datetime

    drive_docs = await list_documents()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document))
        by_id = {d.google_doc_id: d for d in result.scalars().all()}

    ingested, skipped = [], 0
    for f in drive_docs:
        existing = by_id.get(f["id"])
        modified = datetime.fromisoformat(f["modifiedTime"].replace("Z", "+00:00"))

        if existing and existing.last_synced_at and modified <= existing.last_synced_at:
            skipped += 1
            continue

        await ingest_document(f["id"], f["name"])   # insert path auto-tags; update path doesn't
        if existing:
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(Document).where(Document.google_doc_id == f["id"]))
                doc = res.scalar_one_or_none()
                if doc:
                    doc.needs_review = True
                    await db.commit()
        ingested.append(f["name"])

    print(f"[sync] {len(ingested)} ingested, {skipped} unchanged")
    return {"ingested": ingested, "skipped": skipped}

async def list_documents() -> list[dict]:
    return await asyncio.to_thread(list_docs_in_folder, settings.google_drive_folder_id)


async def list_all_files() -> list[dict]:
    return await asyncio.to_thread(list_all_files_in_folder, settings.google_drive_folder_id)