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

Reported by Toby from AI Studio (2026-10-23): **30 RPM and 1,000 RPD**, with 0 used. The figures weren't broken down per model, so treat them as the ceiling for every Gemini model in use.

What that allows:
- Ingestion is paced at one doc every 8 s (`INGEST_PACING_SECONDS`), about 7.5 docs/min; each doc makes 1–3 Gemini calls (parse, OCR batches, tagging). That stays under 30 RPM.
- Re-ingesting all 30 notes costs well under 1,000 RPD.
- A 40-question eval with a Gemini LLM judge is 40 calls. Pace it at 2 s or more apart and it costs 4% of the daily quota.

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

A LangSmith project ("RAG Portfolio") exists but has never received a trace: `langsmith_tracing` defaults to `"false"` and no tracing is wired up. Usage is therefore 0 against the free plan's monthly cap (5,000 base traces at the last published pricing). No sampling is needed unless tracing is turned on later.

## 5. Geist in `next/font/google`

`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` (Next 14.2.3) has no Geist entry. Per §3.3 the fallback is committed woff2 files + `next/font/local`.

**Done:** the variable fonts from the official `vercel/geist-font` v1.7.2 release (`Geist[wght].woff2`, `GeistMono[wght].woff2`, OFL-1.1) are committed as `frontend/src/app/fonts/GeistVF.woff2` and `GeistMonoVF.woff2` and loaded with `next/font/local` in `layout.tsx`. v1.7.2 (June 2026) was chosen over the days-old v1.8.x releases.

## 6. Corpus size

Production database on 2026-10-23:

| docs | chunks | chunks/doc | largest doc | parse: multimodal / fallback | folders (courses) | skills | logged queries |
|---|---|---|---|---|---|---|---|
| 30 | 2,956 | 98.5 | 266 | 19 / 10 | 32 (28) | 210 | 3 |

What this means for later phases:
- **Knowledge map (Phase 6):** 2,956 points with id, x/y, doc and module index come to roughly 150–200 KB raw, about 40–60 KB gzipped, inside the < 200 KB budget. t-SNE on 2,956 × 384 is a seconds-scale batch job.
- **Postgres chunk mirror (Phase 2):** 2,956 rows × (≤ ~1 KB text + 384-dim vector ≈ 1.5 KB) is about 8 MB plus indexes, small next to the 768 MB container limit.
- **OCR experiment (Phase 9):** 10 of 30 docs are `fallback`, so text inside their images is missing. That's a larger share than expected, which makes Phase 9 more worthwhile.

`sklearn.manifold.TSNE` imports in the production backend container.

A `pg_dump` of production is restored into the local compose Postgres (`portfolio.dump` at the repo root, git-ignored).

## Baseline eval

Recorded here once the Phase 2 harness exists.
