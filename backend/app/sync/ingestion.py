# backend/app/sync/ingestion.py
import asyncio
import json
import time
from datetime import datetime
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

# OpenAI-compat client for text-only generation (tagging, course summaries).
_llm = AsyncOpenAI(
    api_key=settings.gemini_api_key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

# Flash-Lite for tagging: higher free-tier RPM/RPD than Flash, and tagging is
# formulaic extraction — Lite is plenty.
TAG_MODEL = settings.tag_model

# Parse statuses persisted on Document.parse_status:
PARSE_TEXT = "text"              # no images in doc — plain text export
PARSE_MULTIMODAL = "multimodal"  # images present, Gemini parse succeeded
PARSE_FALLBACK = "fallback"      # images present, parse FAILED → image-text missing

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


# ── Rate-limit resilience ────────────────────────────────

async def _with_backoff(fn, *args, attempts: int = 4, base: int = 10, **kwargs):
    """Retry rate-limited LLM calls with exponential backoff (10s, 20s, 40s, 80s).
    Non-rate-limit errors raise immediately."""
    for i in range(attempts):
        try:
            return await fn(*args, **kwargs)
        except Exception as e:
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "rate" in msg.lower():
                wait = base * (2 ** i)
                print(f"[llm] rate limited, retrying in {wait}s ({i + 1}/{attempts})")
                await asyncio.sleep(wait)
                continue
            raise
    raise RuntimeError("Rate limit: retries exhausted")


# ── Text resolution (parse step) ─────────────────────────

def _parse_pdf_to_markdown(pdf_bytes: bytes, title: str) -> str:
    resp = _genai.models.generate_content(
        model=settings.parse_model,
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


async def resolve_doc_text(google_doc_id: str, title: str) -> tuple[str, str]:
    """Returns (text, parse_status).
    Text-only docs → instant export ('text').
    Image-bearing docs → PDF → Gemini markdown ('multimodal').
    If the multimodal parse fails past all retries, falls back to plain-text
    export ('fallback') so the doc still ingests — the status is persisted and
    surfaced in the UI so the miss is never silent."""
    has_images = await asyncio.to_thread(doc_has_images, google_doc_id)
    if not has_images:
        text = await asyncio.to_thread(export_doc_as_text, google_doc_id)
        print(f"[ingest] {title}: text export ({len(text)} chars)")
        return text, PARSE_TEXT

    pdf = await asyncio.to_thread(export_doc_as_pdf, google_doc_id)
    try:
        md = await _with_backoff(asyncio.to_thread, _parse_pdf_to_markdown, pdf, title)
        print(f"[ingest] {title}: multimodal parse ({len(md)} chars, image-text captured)")
        return md, PARSE_MULTIMODAL
    except Exception as e:
        print(f"[ingest] {title}: multimodal parse FAILED ({e}) — text-export fallback, "
              f"image-text missing until re-ingest")
        text = await asyncio.to_thread(export_doc_as_text, google_doc_id)
        return text, PARSE_FALLBACK


# ── LLM generation helpers ───────────────────────────────

async def generate_doc_tags(text: str, title: str) -> dict:
    """One LLM call → {"summary": str, "skills": [str]}. Rate limits are retried
    with backoff; other failures raise, and callers decide whether that's fatal
    (admin button) or soft (auto-ingest)."""
    resp = await _with_backoff(
        _llm.chat.completions.create,
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


async def generate_course_summary(course_name: str, doc_summaries: list[str]) -> str:
    """Draft a folder-level summary from its documents' summaries.
    Returns a draft only — the caller shows it for editing before save."""
    joined = "\n\n".join(f"- {s}" for s in doc_summaries if s)
    resp = await _with_backoff(
        _llm.chat.completions.create,
        model=TAG_MODEL,
        messages=[
            {"role": "system", "content": (
                "You write a concise, professional 2-3 sentence course/module summary "
                "for a student portfolio, synthesised from the summaries of their note "
                "documents. Be specific about skills and knowledge demonstrated. Do not "
                "start with 'This course'. Maximum 60 words. Return only the summary text."
            )},
            {"role": "user", "content": f"Module: {course_name}\n\nNote summaries:\n{joined}"},
        ],
        max_tokens=256,
        temperature=0.5,
        reasoning_effort="none",
    )
    return (resp.choices[0].message.content or "").strip()


# ── Skill resolution (document_skills join) ──────────────

async def resolve_skills(db, names: list[str]) -> list[Skill]:
    """Map skill names to Skill rows, case-insensitively deduped, creating any
    that don't exist yet (category=None → off-diagram pool). Assigning the
    returned list to Document.skills maintains the document_skills join."""
    result = await db.execute(select(Skill))
    by_lower = {s.name.lower(): s for s in result.scalars().all()}
    out = []
    for name in dict.fromkeys(n.strip() for n in names if n and n.strip()):
        skill = by_lower.get(name.lower())
        if skill is None:
            skill = Skill(name=name, category=None, achieved=True)
            db.add(skill)
            by_lower[name.lower()] = skill
        out.append(skill)
    return out


async def _persist_document(google_doc_id: str, title: str, chunk_count: int,
                            text: str, parse_status: str) -> bool:
    """Upsert the Document row. Tags generate on first insert AND on re-ingest
    of any doc never successfully tagged (no summary, not approved) — a failed
    first attempt self-heals on the next ingest. Approved docs are never
    overwritten; edits go through the homepage editor.
    Returns False only if tagging was needed and failed."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document).where(Document.google_doc_id == google_doc_id))
        doc = result.scalar_one_or_none()
        is_new = doc is None
        needs_tags = is_new or (not doc.summary and doc.tag_status != "approved")

        # Generate + resolve BEFORE creating/mutating the doc: resolve_skills
        # runs a SELECT, whose autoflush would make a freshly-added doc
        # persistent mid-function — assigning .skills after that point triggers
        # an implicit lazy load → MissingGreenlet.
        tags, skill_rows, tagged = None, None, False
        if needs_tags:
            try:
                tags = await generate_doc_tags(text, title)
                skill_rows = await resolve_skills(db, tags["skills"])
                tagged = True
            except Exception as e:
                print(f"[ingest] Tagging FAILED for {title}: {e} — left pending")

        if is_new:
            doc = Document(google_doc_id=google_doc_id, title=title, chunk_count=chunk_count)
            db.add(doc)
        else:
            doc.title = title
            doc.chunk_count = chunk_count
        doc.last_synced_at = sa_func.now()
        doc.parse_status = parse_status

        if tagged:
            doc.summary = tags["summary"]
            doc.skills = skill_rows
            doc.tag_status = "approved"
            print(f"[ingest] {title}: tagged ({len(skill_rows)} skills linked)")

        await db.commit()
        return tagged or not needs_tags

# ── Main ingestion ───────────────────────────────────────

async def ingest_document(google_doc_id: str, title: str = None) -> dict:
    start = time.time()

    if not title:
        meta = await asyncio.to_thread(get_doc_metadata, google_doc_id)
        title = meta["name"]

    print(f"[ingest] Starting: {title} ({google_doc_id})")

    text, parse_status = await resolve_doc_text(google_doc_id, title)

    chunks = chunk_document(text=text, doc_id=google_doc_id, doc_title=title)
    print(f"[ingest] {len(chunks)} chunks from {title}")

    if not chunks:
        print(f"[ingest] WARNING: 0 chunks from {title} — doc may be empty")
        return {"doc_id": google_doc_id, "title": title, "chunk_count": 0,
                "elapsed_ms": 0, "parse_status": parse_status}

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
        await _persist_document(google_doc_id, title, len(chunks), text, parse_status)
    except Exception as e:
        print(f"[ingest] Document row persist failed for {title}: {e}")

    elapsed = round((time.time() - start) * 1000)
    print(f"[ingest] Done: {title} — {len(chunks)} chunks in {elapsed}ms ({parse_status})")
    return {"doc_id": google_doc_id, "title": title, "chunk_count": len(chunks),
            "elapsed_ms": elapsed, "parse_status": parse_status}


# ── Delta sync (UPDATE-ONLY by design) ───────────────────

async def sync_changed_documents() -> dict:
    """Re-ingest docs whose Drive modifiedTime is newer than last_synced_at.
    Deliberately does NOT insert brand-new files — insertion is a curated act
    done through the admin Drive picker. New files are reported so they don't
    go unnoticed. Changed docs get needs_review=True."""
    drive_docs = await list_documents()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document))
        by_id = {d.google_doc_id: d for d in result.scalars().all()}

    ingested, skipped, new_files = [], 0, []
    for f in drive_docs:
        existing = by_id.get(f["id"])
        if not existing:
            new_files.append(f["name"])
            continue

        modified = datetime.fromisoformat(f["modifiedTime"].replace("Z", "+00:00"))
        if existing.last_synced_at and modified <= existing.last_synced_at:
            skipped += 1
            continue

        await ingest_document(f["id"], f["name"])   # existing row → update path, no tag overwrite
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Document).where(Document.google_doc_id == f["id"]))
            doc = res.scalar_one_or_none()
            if doc:
                doc.needs_review = True
                await db.commit()
        ingested.append(f["name"])

    print(f"[sync] {len(ingested)} re-ingested, {skipped} unchanged, {len(new_files)} new (not ingested)")
    return {"ingested": ingested, "skipped": skipped, "new_files": new_files}


# ── Drive listings ───────────────────────────────────────

async def list_documents() -> list[dict]:
    return await asyncio.to_thread(list_docs_in_folder, settings.google_drive_folder_id)


async def list_all_files() -> list[dict]:
    return await asyncio.to_thread(list_all_files_in_folder, settings.google_drive_folder_id)