# backend/app/rag/pg_chunks.py
"""The Postgres side of retrieval: the `chunks` mirror of the Zilliz collection,
full-text (lexical) search over it, and pgvector search for the Zilliz
comparison."""
import re

from sqlalchemy import text

from app.db.database import AsyncSessionLocal
from app.db.models import COURSE_CODE_SQL

_ROW = "c.id, c.text, c.heading, c.google_doc_id AS doc_id, c.chunk_index, d.title AS doc_title"
_JOIN = "FROM chunks c LEFT JOIN documents d ON d.google_doc_id = c.google_doc_id"

# OR the question's lexemes instead of AND-ing them (websearch_to_tsquery's
# default): a visitor's question rarely has every word in one chunk, and
# ts_rank_cd still ranks chunks that match more terms higher. The outer
# 'simple' parse keeps the already-stemmed lexemes as they are.
_QUERY = ("to_tsquery('simple', replace(plainto_tsquery('english', "
          + COURSE_CODE_SQL.format(":q") + ")::text, '&', '|'))")


def _vec(v: list[float]) -> str:
    return "[" + ",".join(map(str, v)) + "]"


async def replace_doc_chunks(google_doc_id: str, embedded_chunks: list[dict]):
    """Delete-then-insert one doc's chunks, mirroring the Zilliz rewrite."""
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM chunks WHERE google_doc_id = :g"), {"g": google_doc_id})
        if embedded_chunks:
            await db.execute(text(
                "INSERT INTO chunks (id, document_id, google_doc_id, chunk_index, heading, text, embedding) "
                "VALUES (:id, (SELECT id FROM documents WHERE google_doc_id = :g), :g, :i, :h, :t, CAST(:e AS vector))"),
                [{"id": c["id"], "g": google_doc_id, "i": c["chunk_index"], "h": c["heading"] or "",
                  "t": c["text"], "e": _vec(c["vector"])} for c in embedded_chunks])
        await db.commit()


async def lexical_search(question: str, limit: int = 20, doc_id: str | None = None) -> list[dict]:
    """`doc_id` limits the search to one note."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            f"SELECT {_ROW}, ts_rank_cd(c.tsv, q) AS score {_JOIN}, {_QUERY} q "
            "WHERE c.tsv @@ q AND (CAST(:g AS text) IS NULL OR c.google_doc_id = :g) "
            "ORDER BY score DESC LIMIT :n"), {"q": question, "n": limit, "g": doc_id})).mappings().all()
    return [dict(r) for r in rows]


async def dense_search(vector: list[float], limit: int = 20, doc_id: str | None = None) -> list[dict]:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            f"SELECT {_ROW}, 1 - (c.embedding <=> CAST(:v AS vector)) AS score {_JOIN} "
            "WHERE CAST(:g AS text) IS NULL OR c.google_doc_id = :g "
            "ORDER BY c.embedding <=> CAST(:v AS vector) LIMIT :n"),
            {"v": _vec(vector), "n": limit, "g": doc_id})).mappings().all()
    return [dict(r) for r in rows]


HIGHLIGHT = ("⟦", "⟧")   # match markers in snippets; the client splits on them, so no HTML travels


async def snippets(chunk_ids: list[str], question: str) -> dict[str, str]:
    """Short excerpts around the question's terms, with matches wrapped in
    HIGHLIGHT. Chunks the terms don't appear in get their opening words."""
    if not chunk_ids:
        return {}
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            f"SELECT c.id, ts_headline('english', regexp_replace(c.text, '^#+[^\\n]*\\n+', ''), q, "
            f"'StartSel={HIGHLIGHT[0]}, StopSel={HIGHLIGHT[1]}, MaxWords=26, MinWords=12, MaxFragments=1, "
            f"FragmentDelimiter= … ') AS snippet FROM chunks c, {_QUERY} q WHERE c.id = ANY(:ids)"),
            {"q": question, "ids": chunk_ids})).all()
    # Snippets are plain text: drop Markdown emphasis, table pipes and code ticks.
    return {cid: re.sub(r"\s+", " ", re.sub(r"[*`|#>_]+|\$[^$]*\$", " ", s)).strip() for cid, s in rows}


async def neighbours(doc_id: str, chunk_index: int, heading: str) -> list[dict]:
    """The chunks either side of one hit, when they're under the same heading."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            f"SELECT {_ROW}, 0.0 AS score {_JOIN} WHERE c.google_doc_id = :g AND c.heading = :h "
            "AND c.chunk_index IN (:i - 1, :i + 1) ORDER BY c.chunk_index"),
            {"g": doc_id, "h": heading, "i": chunk_index})).mappings().all()
    return [dict(r) for r in rows]
