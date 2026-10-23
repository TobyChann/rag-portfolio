# Phase 0 findings

Checked 2026-10-23. Items marked **TODO (Toby)** need a login or the production VM.

## 1. Gemini models and limits

`GET /v1beta/models` with the project key lists all three configured IDs, so no model string changes:

| Setting | Value | Resolves |
|---|---|---|
| `parse_model` / `rag_model` | `gemini-3.5-flash` | yes |
| `tag_model` | `gemini-3.1-flash-lite` | yes |
| `planning_model` | `gemini-2.5-flash` | yes |

Newer IDs exist (`gemini-3.6/3.7/3.8-flash`, `gemini-3.5-flash-lite`). Not switching: the rule is to change only dead strings.

**TODO (Toby):** copy the per-model RPM / RPD from https://aistudio.google.com/rate-limit into this table.

| Model | RPM | RPD | TPM |
|---|---|---|---|
| gemini-3.5-flash | | | |
| gemini-3.1-flash-lite | | | |
| gemini-2.5-flash | | | |

## 2. scikit-learn / TSNE

`requirements.lock` pins `scikit-learn==1.8.0`, `scipy==1.17.1` and `numpy==2.4.6`, all pulled in by sentence-transformers, so `sklearn.manifold.TSNE` is available. Confirm once in the running container:

```
docker compose exec backend python -c "from sklearn.manifold import TSNE; print('ok')"
```

## 3. Postgres image / pgvector

- Production (`docker-compose.prod.yml`) uses `pgvector/pgvector:pg17`.
- Local `docker-compose.yml` has **no Postgres service**. `backend/.env` points `DATABASE_URL` at the old Supabase pooler, so local dev reads the pre-migration Supabase data, not what production has.
- Supabase does support `CREATE EXTENSION vector`, but generated `tsvector` columns, HNSW and the Phase 2 benchmarks should run against the same image as production.

**Resolved in Phase 1:** the Supabase project no longer accepts connections ("tenant/user … not found"), so local dev had no working database. Local compose now runs `pgvector/pgvector:pg17` and overrides `DATABASE_URL` for the backend. `CREATE EXTENSION vector` works (pgvector 0.8.7). The local DB starts empty; for real data, restore a `pg_dump` from the VM.

## 4. LangSmith

The free Developer plan includes 5,000 base traces/month (as of the last published pricing). Tracing is currently `langsmith_tracing="false"` by default. **TODO (Toby):** confirm the cap and current usage at smith.langchain.com → Settings → Usage.

## 5. Geist in `next/font/google`

`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` (Next 14.2.3) has no Geist entry. Per §3.3 the fallback is committed woff2 files + `next/font/local`.

**Needs approval:** download `GeistVF.woff2` and `GeistMonoVF.woff2` (OFL-1.1) from the official `vercel/geist-font` GitHub release into `frontend/src/app/fonts/`. Until then the font stack falls back to system-ui.

## 6. Corpus size

**TODO (Toby):** run on the VM:

```
docker compose -f docker-compose.prod.yml exec postgres psql -U portfolio -d portfolio -c "
select count(*) docs, sum(chunk_count) chunks, round(avg(chunk_count),1) chunks_per_doc,
       (select count(*) from folders) folders,
       (select count(*) from folders where is_course) courses
from documents;"
```

Average chunk characters needs the Phase 2 `chunks` table (or a Zilliz query); `CHUNK_SIZE = 256` × 4 caps a chunk at about 1,024 chars plus its heading.

## Baseline eval

Recorded here once the Phase 2 harness exists.
