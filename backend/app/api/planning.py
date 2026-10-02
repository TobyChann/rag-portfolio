# backend/app/api/planning.py
"""Owner-only planning chat.

Memory model (locked design): the model's knowledge of the owner comes from
injecting structured state (profile_notes + skills + retrieved note excerpts)
into every request — NOT from an ever-growing transcript. The transcript
(chats/chat_messages) only keeps a single discussion coherent and reopenable.
Threads are independent: chat B does not see chat A's transcript.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Chat, ChatMessage, ProfileNote, Skill
from app.api.admin import require_admin
from app.rag.embedder import embed_query
from app.rag.retriever import retrieve
from app.config import get_settings
from app.llm import gemini_client
from app.sync.resume import get_resume_text

settings = get_settings()

# Every route in this router is owner-only.
router = APIRouter(dependencies=[Depends(require_admin)])

_llm = gemini_client()

# Planning is the ONE path where thinking stays ON (deliberately no
# reasoning_effort="none"): we want reasoning here, and the generous
# max_tokens leaves room for thinking + a full visible answer.
PLANNING_MODEL = settings.planning_model
MAX_HISTORY = 20

PLANNING_SYSTEM = """You are the owner's personal career-planning assistant inside their portfolio app.
You are talking to the owner themselves (not a recruiter). Speak to them directly.

You are given their live profile, their curated skill inventory, and excerpts from
their own study notes relevant to the current question. Ground advice in these.

Guidelines:
- Be direct, concrete, and honest. Challenge unrealistic plans; do not flatter.
- When recommending a skill to learn, name it precisely and give a one-sentence reason,
  so the owner can add it to their skill board.
- Prioritise: if asked what to do, give an ordered shortlist, not an exhaustive dump.
- Your knowledge of fast-moving facts (current hiring climate, this year's admissions,
  specific course codes) may be outdated or wrong — say so instead of inventing specifics.
- Format replies in Markdown like a normal chat assistant: short paragraphs, bullet or
  numbered lists where they help, **bold** for key terms, and ### headings only for
  long answers. No horizontal rules, no tables unless comparing options.
- Open with the answer itself. Never open with praise or a recap of the owner's profile."""


# ── Context assembly (the "memory") ─────────────────────

async def _profile_block(db: AsyncSession) -> str:
    notes = (await db.execute(
        select(ProfileNote).order_by(ProfileNote.category, ProfileNote.created_at)
    )).scalars().all()
    skills = (await db.execute(
        select(Skill).order_by(Skill.category, Skill.sort_order, Skill.name)
    )).scalars().all()

    profile = "\n".join(f"- [{n.category}] {n.content}" for n in notes) or "(no profile notes yet)"
    categorised = [s for s in skills if s.category]
    uncategorised = [s for s in skills if not s.category]
    skills_txt = "\n".join(
        f"- {s.name}" + (f" ({s.category})" if s.category else "")
        for s in categorised + uncategorised
    ) or "(empty)"
    resume = await get_resume_text()
    resume_txt = f"\n\nRESUME:\n{resume}" if resume else ""
    return (f"OWNER PROFILE:\n{profile}\n\nSKILL INVENTORY (skills the owner has):\n{skills_txt}"
            f"{resume_txt}")


async def _notes_block(question: str) -> str:
    try:
        vector = await embed_query(question)
        chunks = await retrieve(vector, top_k=5)
    except Exception as e:
        print(f"[planning] retrieval failed (non-fatal): {e}")
        return ""
    if not chunks:
        return ""
    body = "\n\n".join(
        f"[{c['doc_title']} — {c['heading']}]\n{c['text'][:800]}" for c in chunks
    )
    return f"\n\nRELEVANT EXCERPTS FROM THE OWNER'S STUDY NOTES:\n{body}"


# ── Chats CRUD ───────────────────────────────────────────

def _serialize_chat(c: Chat) -> dict:
    return {
        "id": str(c.id),
        "title": c.title or "New chat",
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _serialize_message(m: ChatMessage) -> dict:
    return {
        "id": str(m.id),
        "role": m.role,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


class ChatUpdate(BaseModel):
    title: str


class MessageCreate(BaseModel):
    content: str


@router.get("/chats")
async def list_chats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).order_by(Chat.updated_at.desc().nullslast(), Chat.created_at.desc()))
    return [_serialize_chat(c) for c in result.scalars().all()]


@router.post("/chats")
async def create_chat(db: AsyncSession = Depends(get_db)):
    chat = Chat()
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return _serialize_chat(chat)


@router.patch("/chats/{chat_id}")
async def rename_chat(chat_id: str, req: ChatUpdate, db: AsyncSession = Depends(get_db)):
    chat = await _get_chat(db, chat_id)
    chat.title = req.title.strip() or chat.title
    await db.commit()
    await db.refresh(chat)
    return _serialize_chat(chat)


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, db: AsyncSession = Depends(get_db)):
    chat = await _get_chat(db, chat_id)
    await db.delete(chat)   # messages cascade via FK ondelete
    await db.commit()
    return {"ok": True}


@router.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, db: AsyncSession = Depends(get_db)):
    await _get_chat(db, chat_id)
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.chat_id == uuid.UUID(chat_id))
        .order_by(ChatMessage.created_at)
    )
    return [_serialize_message(m) for m in result.scalars().all()]


async def _get_chat(db: AsyncSession, chat_id: str) -> Chat:
    try:
        cid = uuid.UUID(chat_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Chat not found")
    result = await db.execute(select(Chat).where(Chat.id == cid))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


# ── Send message ─────────────────────────────────────────

@router.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, req: MessageCreate, db: AsyncSession = Depends(get_db)):
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    chat = await _get_chat(db, chat_id)

    user_msg = ChatMessage(chat_id=chat.id, role="user", content=content)
    db.add(user_msg)
    if not chat.title:
        chat.title = content[:60] + ("…" if len(content) > 60 else "")
    await db.flush()

    # Transcript for THIS thread only (keeps the discussion coherent)
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.chat_id == chat.id)
        .order_by(ChatMessage.created_at.desc()).limit(MAX_HISTORY)
    )
    history = list(reversed(result.scalars().all()))

    # Structured state — the actual memory
    context = await _profile_block(db) + await _notes_block(content)

    messages = [
        {"role": "system", "content": PLANNING_SYSTEM},
        {"role": "system", "content": context},
        *[{"role": m.role, "content": m.content} for m in history],
    ]

    try:
        response = await _llm.chat.completions.create(
            model=PLANNING_MODEL,
            messages=messages,
            max_tokens=8192,      # thinking shares this budget — keep it generous
            temperature=0.7,
        )
        answer = response.choices[0].message.content or "(empty response)"
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    assistant_msg = ChatMessage(chat_id=chat.id, role="assistant", content=answer)
    db.add(assistant_msg)
    await db.commit()
    # Refresh chat too: its updated_at (onupdate=func.now()) is server-generated,
    # so SQLAlchemy expires it after commit. Serializing it without an explicit
    # async refresh triggers a lazy reload outside greenlet context → MissingGreenlet.
    await db.refresh(chat)
    await db.refresh(user_msg)
    await db.refresh(assistant_msg)

    return {
        "user": _serialize_message(user_msg),
        "assistant": _serialize_message(assistant_msg),
        "chat": _serialize_chat(chat),
    }


# ── Profile export (copy-as-prompt) ──────────────────────

@router.get("/export")
async def export_profile(db: AsyncSession = Depends(get_db)):
    """Assemble the structured profile as pasteable text, so any external LLM
    can be given the exact same context this app uses."""
    block = await _profile_block(db)
    text = (
        "Here is my current profile and skill inventory. "
        "Use it as ground truth about me when answering.\n\n" + block
    )
    return {"text": text}