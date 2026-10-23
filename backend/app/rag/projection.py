# backend/app/rag/projection.py
"""The knowledge map: every chunk of every approved note placed in 2-D by
t-SNE over its embedding, so related material lands close together.

Projection is a batch job (after ingestion/sync, or POST /admin/map/recompute),
never per request: about 30 s on a laptop, a minute or two on the 1-CPU VM.
The /api/map payload is cached in Redis until the next recompute."""
import asyncio
import json

import numpy as np
from sqlalchemy import text

from app.cache.redis_client import get_redis
from app.db.database import AsyncSessionLocal
from app.revalidate import MAP_KEY, refresh_public_pages

_lock = asyncio.Lock()


def _project(vectors: np.ndarray) -> np.ndarray:
    from sklearn.manifold import TSNE   # heavy import, only in the job
    xy = TSNE(n_components=2, perplexity=30, random_state=42, init="pca",
              metric="cosine", n_jobs=1).fit_transform(vectors)
    # One scale for both axes keeps the shape; then centre in [0, 1].
    xy -= xy.min(axis=0)
    xy /= max(xy.max(), 1e-9)
    xy += (1 - xy.max(axis=0)) / 2
    return xy


async def recompute() -> int:
    """Re-project all chunks with embeddings; returns how many were placed.
    Concurrent calls wait for the running one rather than doubling the work."""
    async with _lock:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(text(
                "SELECT id, embedding::text FROM chunks WHERE embedding IS NOT NULL ORDER BY id"))).all()
        if len(rows) < 5:
            return 0
        vectors = np.array([np.fromstring(e.strip("[]"), sep=",", dtype=np.float32) for _, e in rows])
        xy = await asyncio.to_thread(_project, vectors)
        async with AsyncSessionLocal() as db:
            await db.execute(text("UPDATE chunks SET map_x = :x, map_y = :y WHERE id = :id"),
                             [{"id": cid, "x": float(x), "y": float(y)} for (cid, _), (x, y) in zip(rows, xy)])
            await db.commit()
        await refresh_public_pages()   # drops the cached map and re-renders the homepage snapshot
        print(f"[map] projected {len(rows)} chunks")
        return len(rows)


def recompute_soon():
    """Fire-and-forget after an ingest or sync that changed something."""
    async def run():
        try:
            await recompute()
        except Exception as e:
            print(f"[map] recompute failed: {e}")
    asyncio.create_task(run())


async def map_payload() -> dict:
    """Compact map for the homepage: approved notes only, no chunk text.
      modules  [{key, name}]                top-level folders, for colour
      docs     [{id, name, module}]         module = index into modules
      headings [str]                        deduplicated
      points   [[x, y, doc, chunk_index, heading]]   doc/heading are indexes"""
    r = await get_redis()
    cached = await r.get(MAP_KEY)
    if cached:
        return json.loads(cached)

    async with AsyncSessionLocal() as db:
        folders = {fid: (name, parent) for fid, name, parent in
                   (await db.execute(text("SELECT id, name, parent_id FROM folders"))).all()}
        rows = (await db.execute(text(
            "SELECT c.map_x, c.map_y, c.chunk_index, c.heading, d.google_doc_id, d.title, d.folder_id "
            "FROM chunks c JOIN documents d ON d.google_doc_id = c.google_doc_id AND d.tag_status = 'approved' "
            "WHERE c.map_x IS NOT NULL ORDER BY d.title, c.chunk_index"))).all()

    def top(fid):
        seen = set()
        while fid in folders and folders[fid][1] in folders and fid not in seen:
            seen.add(fid)
            fid = folders[fid][1]
        return folders[fid][0] if fid in folders else "Other"

    modules: dict[str, int] = {}
    docs: dict[str, int] = {}
    doc_list, headings, heading_idx, points = [], [], {}, []
    for x, y, idx, heading, g, title, folder_id in rows:
        if g not in docs:
            m = modules.setdefault(top(folder_id), len(modules))
            docs[g] = len(doc_list)
            name = folders[folder_id][0] if folder_id in folders else title
            doc_list.append({"id": g, "name": name, "module": m})
        h = (heading or "").lstrip("# ").strip()
        if h not in heading_idx:
            heading_idx[h] = len(headings)
            headings.append(h)
        points.append([round(x, 4), round(y, 4), docs[g], idx, heading_idx[h]])

    payload = {"modules": [{"key": i, "name": n} for n, i in modules.items()],
               "docs": doc_list, "headings": headings, "points": points}
    await r.set(MAP_KEY, json.dumps(payload, separators=(",", ":")))
    return payload
