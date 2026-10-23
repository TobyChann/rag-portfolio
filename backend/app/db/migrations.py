# backend/app/db/migrations.py
"""Ordered, run-once schema migrations for changes create_all() can't make
(renames, new columns on existing tables). Each runs in a transaction and is
recorded in schema_migrations, so startup applies only what's new. Append new
migrations to the end; never edit or reorder applied ones."""
from sqlalchemy import text

MIGRATIONS: list[tuple[str, list[str]]] = [
    ("001_courses_to_folder_tree", [
        # Course folders become a general folder tree: any folder can nest in
        # another, and a "course" is just a folder flagged is_course that also
        # carries grade / summary / currently-learning details.
        "ALTER TABLE courses RENAME TO folders",
        "ALTER TABLE folders ADD COLUMN parent_id UUID REFERENCES folders(id) ON DELETE SET NULL",
        "ALTER TABLE folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE folders ADD COLUMN is_course BOOLEAN NOT NULL DEFAULT FALSE",
        "UPDATE folders SET is_course = TRUE",
        "CREATE INDEX ix_folders_parent_id ON folders (parent_id)",
        "ALTER TABLE documents RENAME COLUMN course_id TO folder_id",
        "ALTER INDEX IF EXISTS ix_documents_course_id RENAME TO ix_documents_folder_id",
    ]),
    ("002_queries_rewritten_question", [
        # The standalone question a follow-up was condensed into (NULL when
        # the visitor's question already stood alone).
        "ALTER TABLE queries ADD COLUMN rewritten_question TEXT",
    ]),
]


async def run_migrations(conn) -> list[str]:
    """Apply pending migrations on an AsyncConnection. Returns the ids applied.
    On a fresh database (no legacy tables) migrations are recorded as applied
    without running, since create_all() already builds the current schema."""
    await conn.execute(text(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"))
    done = set((await conn.execute(text("SELECT id FROM schema_migrations"))).scalars())
    fresh = not (await conn.execute(text("SELECT to_regclass('public.documents')"))).scalar()

    applied = []
    for mig_id, statements in MIGRATIONS:
        if mig_id in done:
            continue
        if not fresh:
            for sql in statements:
                await conn.execute(text(sql))
        await conn.execute(text("INSERT INTO schema_migrations (id) VALUES (:id)"), {"id": mig_id})
        applied.append(mig_id)
    return applied
