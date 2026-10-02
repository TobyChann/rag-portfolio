# backend/app/rag/overview.py
"""A compact Markdown outline of the notes tree (folders → courses with grade,
status and summary) that goes into every chatbot and planning prompt.

Vector search answers detail questions well but broad ones badly ("What has
Toby studied in Finance?" matched stray note passages, not the course list).
The outline is ~2k tokens, so it's cheaper and more reliable to always include
it than to index it."""
from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Folder

_cached: str | None = None


def _line(f: Folder) -> str:
    facts = []
    if f.is_currently_learning:
        facts.append("currently taking")
    if f.grade:
        facts.append(f"grade {f.grade}")
    if f.notes:
        facts.append(f.notes.rstrip("."))
    head = f"**{f.name}**" + (f" ({'; '.join(facts)})" if facts else "")
    return f"{head}: {f.summary}" if f.summary else head


async def build_overview() -> str:
    async with AsyncSessionLocal() as db:
        folders = (await db.execute(select(Folder).order_by(
            Folder.sort_order, Folder.is_currently_learning.desc(), Folder.name))).scalars().all()

    kids: dict = {}
    for f in folders:
        kids.setdefault(f.parent_id, []).append(f)

    lines: list[str] = []

    def walk(parent, depth: int, seen: frozenset):
        for f in kids.get(parent, []):
            if f.id in seen:
                continue
            if depth == 0:
                lines.append(f"\n## {f.name}")
            else:
                lines.append(f"{'  ' * (depth - 1)}- {_line(f)}")
            walk(f.id, depth + 1, seen | {f.id})

    walk(None, 0, frozenset())
    return "\n".join(lines).strip()


async def get_overview() -> str:
    """The outline, built once and cached until invalidate_overview()."""
    global _cached
    if _cached is None:
        _cached = await build_overview()
    return _cached


def invalidate_overview():
    """Call after any folder change or note move."""
    global _cached
    _cached = None
