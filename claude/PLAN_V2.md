# RAGPortfolio v2: UX, features and retrieval plan

Handoff doc for Claude Code. Read all of it before planning. Work phase by phase; each phase ends in a working, deployable state.

---

## 0. Working agreements (non-negotiable)

**How to work**
- **Diagnose before fixing.** For anything that looks broken, quote the file and line or the log before proposing a change.
- **Backend first.** Every new endpoint must be testable in Swagger (`/docs`) before any frontend work for it starts. Show the request and response.
- **Full file replacements** when a file changes substantially; no partial snippets that drift.

**Code style**
- Human-looking code: minimal comments, no banner comments, no "AI-style" docstrings on trivial functions.
- Inline over indirection: no helper with a single caller, no new abstraction layers.
- Don't reintroduce redundancy. If two things do the same job, delete one.

**Dependencies**
- Default answer to a new dependency is no.
- The only pre-approved new frontend dependency is `motion` (see §3.5).
- No new backend dependencies. numpy, and possibly scikit-learn, already arrive transitively via sentence-transformers. Verify with `python -c "import sklearn"` inside the backend container before relying on sklearn.

**Respect settled decisions**
- Inline admin CRUD stays in `admin.py`; `crud.py` keeps only reused helpers.
- Skills live in the `Skill` table + `document_skills` join. Categorisation is the single source of truth for the public diagram.
- Homepage Curate mode is the curation surface for doc tags and skills. No separate admin tab for these.
- Batch ingestion is server-side jobs.
- Delta sync is update-only, plus new `Notes_*` docs. The Drive picker handles other inserts.
- The planning chat uses structured state injection (profile notes + skills), not transcript replay.
- Chunk size respects MiniLM's ~256-token window (`CHUNK_SIZE = 256`, ×4 chars).
- Do not re-suggest fixes already in place (e.g. the DrivePicker `setSelected` fix). Assume prior fixes landed unless code proves otherwise.

**Migrations**
- New tables come from `create_all()`.
- New columns on existing tables are appended to `MIGRATIONS` in `backend/app/db/migrations.py`. Never edit applied migrations.

---

## 1. Constraints: free tiers and budgets

Check each limit at the start of Phase 0 and record the real numbers in this table.

| Service | Plan | Limits that matter | Design rule |
|---|---|---|---|
| OpenAI `gpt-4o-mini` | Paid key | Money | Visitor-facing path only (chat answers, JD matcher). Enforce a daily USD budget in Redis (§9.4). |
| Gemini API | Free tier | Per-model RPM/RPD; 503 "high demand" spikes | Offline work only: parse, OCR, tagging, summaries, eval judge, resume structuring. Always exponential backoff (`_with_backoff`). Never block a visitor on Gemini except as the budget fallback. Check limits at https://aistudio.google.com/rate-limit. |
| Gemini model IDs | — | Names change | Before touching any model string, list models with the API and confirm `gemini-3.5-flash` and `gemini-3.1-flash-lite` still resolve. Only change a string that is actually dead. |
| Zilliz Cloud | Free | Storage/compute caps; suspends when idle (`keep_alive()` exists) | Unclear whether BM25 full-text works on the free tier, and it needs a new collection schema anyway. Lexical search goes in Postgres (§5). |
| OCI VM | Always Free (verify shape) | Compose limits: backend `mem_limit: 4g`, postgres `768m`, redis `--maxmemory 64mb allkeys-lru` | Redis LRU can evict `session:*` and `rate:*` keys under pressure. Keep conversation payloads small; raise maxmemory to 128mb if headroom allows. All new heavy compute (t-SNE/PCA, clustering) runs in batch jobs, never per request. |
| Postgres | Self-hosted, `pgvector/pgvector:pg17` image | 768 MB | pgvector and full-text search are available for free. Check that local `docker-compose.yml` uses the same image; if not, switch it. |
| Vercel | Hobby | Personal/non-commercial use, function limits | ISR + server components; `next/og` for images. `/api/*` is captured by `middleware.ts` and proxied to the backend, so any new Next route handler must live **outside** `/api` (e.g. `/revalidate`). |
| LangSmith | Free | Monthly trace cap | Check the cap; sample traces (e.g. 25%) if new features would exceed it. |
| Haikei | Free web app | Some generators paywalled | One-time SVG asset export only. |

**Budget defaults** (all env-configurable in `config.py`):

| Setting | Default |
|---|---|
| `rate_limit_per_hour` (chat) | 20 (existing) |
| `match_rate_limit_per_hour` | 3 |
| `search_rate_limit_per_hour` | 120 |
| `daily_openai_budget_usd` | 0.50 |

---

## 2. Audit: what's wrong today (fix in Phase 1 unless noted)

**Security and polish**
1. **Public API leaks owner state.** `backend/app/api/portfolio.py::doc_dict` returns `tag_status`, `needs_review`, `parse_status` and `chunk_count` to everyone, plus untagged docs. The public `DocModal` in `ModulesSection.tsx` shows "N chunks", "multimodal parse" and "image text missing" to visitors.
2. **Contrast fails WCAG AA.** White text on `--accent #D4A017` is about 2.4:1 (`.btn-primary`); so is amber text on white (`.tab-item.active`, NavBar active link). AA needs 4.5:1 for text.

**Rendering and performance**
3. **No responsive CSS anywhere** (zero `@media`). `PipelineDiagram` is `repeat(5, 1fr)` beside a vertical label, about 55px buttons at 375px. The chat panel is a fixed 360×540 box. Modals aren't full-screen on mobile.
4. **Homepage is fully client-rendered** (`"use client"`, full-page "Loading…" until `/skills` returns). Results: no SEO, poor first paint, and link previews show "My Portfolio" with no image. The title and wordmark never say Toby's name.
5. **`PipelineDiagram` re-renders 60 times a second forever** via `requestAnimationFrame` → `setFlowPos`. No `prefers-reduced-motion` handling. Emoji icons (⬇ → ⚙ ◻ ↗) render differently across OSes.
6. **Skills hidden behind clicks.** A skimming visitor sees five boxes and no skill names.
7. **Geist referenced but never loaded** (`var(--font-geist-sans)`), so everything falls back to system-ui.

**Chat**
8. **No conversation memory.** `stream_rag_query(question)` sees only the latest question, so follow-ups fail. The cache keys on the raw question (`query_cache._hash_question`).
9. **Onboarding gate.** Role and industry are required before the first question.
10. **History lost on refresh.** Messages aren't persisted; only `portfolio_session` is.
11. **Send during streaming.** `loading` flips false on the first delta, so Enter can fire a second request mid-stream. No stop button.
12. **Referral attribution is lost on navigation.** `?ref=` is read from `window.location` only at onboarding time. A visitor who lands with `?ref=stripe`, clicks to `/stack`, then opens chat loses the ref.

**Navigation and dead code**
13. **Login is shown to every visitor** in the navbar.
14. **`frontend/src/components/admin/DocReview.tsx` still exists** (superseded by `ModulesSection`). Delete it after confirming it has no imports.
15. **Chat ↔ portfolio don't link.** Source chips show a summary but can't open the note. The note modal has no "Ask about this".

---

## 3. Design direction

### 3.1 Principles
- **The chat is the product.** It goes in the hero, not just in a corner button.
- **Show proof, not claims.** Every skill links to the notes that evidence it, every answer can show how it was retrieved, and the numbers are live from the DB.
- **Readable in 6 seconds on a phone.** Name, what Toby does, top skills and a way to ask, all above the fold at 375px.
- **One showpiece animation** (the knowledge map lighting up the sources of an answer). Everything else is calm: 150–250 ms, ease-out, transform/opacity only, and all of it disabled under `prefers-reduced-motion`.

### 3.2 Tokens (`globals.css`)
- **Keep amber as the brand, fix contrast.**
  - Filled buttons: `--accent-strong: #B45309` (amber-700) with white text, or dark text on `#F59E0B`. Pick whichever clears 4.5:1 and verify with a contrast check.
  - Amber text on white uses `--accent-text`.
  - `--accent` stays for non-text decoration (dots, borders, focus rings).
- **Move every hardcoded colour into tokens.** This includes `#F8FAFC`, `#FAFAFA`, the stage colours in `PipelineDiagram`, `"white"` and the reds and greens in ModulesSection. Add `--stage-extract`, `--stage-load` and so on.
- **Dark mode.**
  - Add a `:root[data-theme="dark"]` block plus `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.
  - Add a tiny inline script in `layout.tsx` `<head>` that sets `data-theme` from localStorage before paint (no flash).
  - Put a three-state toggle (system / light / dark) in the navbar.
- **Spacing and type scale** as tokens. Breakpoints: `640px` and `960px`.

### 3.3 Type
- Geist Sans + Geist Mono via `next/font`. Next 14.2.3's bundled Google font list may not include Geist. If `next/font/google` can't find it, commit the woff2 files and use `next/font/local`. Do not add the `geist` npm package.
- Mono for numbers, scores and code-ish labels (proof strip, retrieval scores, latency).

### 3.4 Haikei asset
- Toby exports **one** layered-blob or blurry-gradient SVG in the amber palette (light and dark variants) from haikei.app and drops it in `frontend/public/bg/`.
- Optimise it with `npx svgo` (one-off; not a dependency).
- Use it at low opacity behind the hero and as the background of the OG image.
- If the file isn't there yet, use a CSS radial-gradient placeholder and leave a TODO in this doc, not in code.

### 3.5 Motion
- **Approved dependency:** `motion`.
- **Copy from Motion Primitives** into `frontend/src/components/motion/`, adapting them to this codebase:
  - `MorphingDialog`: doc card → note modal.
  - `AnimatedNumber`: proof strip.
  - `InView`: section reveal, once only.
  - `TextShimmer`: replaces "Thinking…".
- Those files use Tailwind classes and `cn()`. Tailwind is configured here, so the classes work. Replace `cn()` with a two-line local join; do not add `clsx` or `tailwind-merge`.
- Use `AnimatePresence` for the chat panel and for JD-match rows streaming in.
- **Do not** adopt Watermelon UI or any other component kit. One animation source only.
- Pipeline flow dot: a CSS `@keyframes` animation, not React state.

### 3.6 Information architecture

**`/` (server component, ISR `revalidate: 300`)**
1. **Hero**
   - Name ("Toby Chan"; full name in metadata), one line ("Information Systems (Business Analytics) & Accountancy @ SMU"), and a one-sentence pitch.
   - **Ask box:** a large input whose placeholder cycles through suggested questions. Submitting opens the chat panel with the question already streaming.
   - Secondary CTAs: "Match me to a job description →" (`/match`), "Download resume", GitHub/LinkedIn/email icons (inline SVG).
2. **Proof strip:** cGPA, modules taken, notes indexed, skills evidenced, "Notes last synced 3 days ago". All from a new public stats endpoint; numbers use `AnimatedNumber`.
3. **Skills**
   - The pipeline diagram stays as a compact header. On mobile it becomes a vertical stepper.
   - **Skill chips are visible by default**, grouped by category, each with an evidence count badge.
   - Clicking a chip opens an evidence popover: notes + modules + grades, and "Ask about <skill>".
4. **Knowledge map** (§8): "Everything I've studied, in one picture."
5. **Modules:** existing explorer; note cards morph into the note modal; each note also has a public page.
6. **Footer:** contact, "How this site works →" `/stack`, theme toggle (if not in navbar). No login link; `/login` stays reachable by URL.

**`/match`:** JD matcher (§7). `/match/[id]` shows a saved result.

**`/notes/[docId]`:** public note page (§6.3).

**`/stack`:** existing page, plus a live eval badge (§5.4) and a "Benchmarks" collapsible.

**Chat panel (all pages)**
- Desktop: right-side drawer, 440px, overlaying the page.
- Mobile: full-height sheet.
- Command palette (§9.1) is available from every page via ⌘K / Ctrl+K and a navbar search button.

### 3.7 Accessibility and quality bar
- Modals and drawers: focus trap, Escape to close, return focus to the opener, `aria-modal`, labelled titles.
- Every icon-only button gets an `aria-label`. Touch targets ≥ 44px on mobile.
- Palette and popovers: correct combobox/listbox ARIA, arrow-key navigation.
- Lighthouse (mobile) on `/`: Performance ≥ 90, Accessibility ≥ 95, SEO 100.
- Code-split `react-markdown` and the chat panel (`next/dynamic`) so the homepage JS stays small.

---

## Phase 0: Verification spikes (no product code)

Produce `docs/phase0-findings.md` with answers to:
1. Real free-tier limits for each Gemini model in use (from AI Studio), and whether the configured model IDs resolve.
2. Whether `import sklearn` works in the backend container, and whether `TSNE` is available.
3. Local compose Postgres image: does it have pgvector? (`CREATE EXTENSION vector`.)
4. The LangSmith plan's trace cap.
5. Whether Next 14.2.3 `next/font/google` has Geist.
6. Measure: chunk count, average chunk chars, number of docs and folders. This sizes the map and search payloads.

---

## Phase 1: Hygiene and foundation

Ship as one PR. Must not change retrieval behaviour.

### 1.1 Backend
- **Public portfolio filtering.** `GET /api/portfolio`:
  - Anonymous: only docs with `tag_status == "approved"`, and omit `tag_status`, `needs_review`, `parse_status`, `chunk_count`.
  - Admin cookie present: today's full payload.
  - Implement with an optional-admin dependency, a variant of `require_admin` that returns bool instead of raising. Curate mode keeps working unchanged.
- **New `GET /api/stats/public`:**
  - `{modules, notes, skills_evidenced, last_synced_at, cgpa?}`.
  - `modules` = folders with `is_course`; `skills_evidenced` = achieved + categorised skills with ≥ 1 linked doc.
  - Cache 5 min in Redis.
- **Optional onboarding.**
  - `POST /api/onboard` accepts `role` and `industry` as optional (`VisitorRole` is already nullable).
  - New `PATCH /api/visitor` `{session_id, role?, industry?}` updates the visitor row and the session blob.

### 1.2 Frontend
- **Server-render the homepage.** Convert `page.tsx` to a server component.
  - Fetch `/skills`, `/portfolio` and `/stats/public` server-side from `process.env.BACKEND_URL` (fall back to `NEXT_PUBLIC_API_URL` locally), with `next: { revalidate: 300, tags: ["portfolio"] }`.
  - Admin pieces (Curate toggle, edit-mode `ModulesSection`, `SkillsBoard`) become client islands that hydrate with the server data.
- **On-demand revalidation.**
  - Add the route handler `app/revalidate/route.ts` (outside `/api`), secret-protected, calling `revalidateTag("portfolio")`.
  - Backend calls it after curation writes and after sync. New settings: `frontend_revalidate_url`, `revalidate_secret`.
- **Metadata.**
  - Real title and description.
  - `openGraph` and `twitter`.
  - `app/opengraph-image.tsx` via `next/og`: Haikei background, name, line, cGPA, top 6 skills.
  - `app/sitemap.ts`; `app/robots.ts` disallowing `/admin`, `/planning` and `/login`.
  - JSON-LD `Person` in `layout.tsx`.
- **Fonts, tokens, contrast, dark mode, breakpoints** per §3.2–3.3.
- **`PipelineDiagram`:** CSS animation instead of rAF; inline SVG icons instead of emoji; vertical layout under 640px; top 3–4 skills visible inside each stage.
- **NavBar:** "Toby Chan." wordmark, search button (⌘K hint), theme toggle; remove the Login button for anonymous visitors.
- **Chat fixes**
  - Separate `streaming` state from `loading`; disable send while streaming; add a Stop button that aborts via `AbortController` passed into `streamQuery`.
  - Persist messages in `localStorage` keyed by session (cap 50).
  - Capture `?ref=` on first landing into `localStorage`.
  - Onboarding becomes "Who's asking?" chips shown once, under the first answer, calling `PATCH /api/visitor`. The session is created silently when the panel first opens.
- **Public `DocModal`:** hide chunk count and parse badges unless `editMode`.
- **Delete `DocReview.tsx`** (grep for imports first).

**Done when:**
- An anonymous `/api/portfolio` returns no internal fields.
- Homepage HTML contains the skill names in view-source.
- Link previews show the OG image.
- 375px has no horizontal scroll.
- Lighthouse targets from §3.7 are met.
- `prefers-reduced-motion` stops all animation.

---

## Phase 2: Retrieval foundation, measured

Build the eval harness first so every later change is measured.

### 2.1 Eval harness
- **Golden set.** `backend/evals/golden.jsonl`, one per line: `{"q": "...", "expect_docs": ["<google_doc_id>", ...], "must_mention": ["..."]}`.
  - Claude Code drafts ~40 candidates from doc titles, headings and the module outline.
  - **Toby approves or edits them.** Never auto-accept them.
  - Include follow-up pairs (§4) and acronym or course-code queries ("IS459", "FCFF", "DCF").
- **Runner.** `python -m app.evals.run`, which:
  - Computes retrieval recall@5 and MRR against `expect_docs`.
  - Computes answer `must_mention` hit rate.
  - Optionally runs an LLM-judge faithfulness score on Gemini flash-lite (free tier, with backoff, offline only).
- **Storage.** New table `eval_runs` (`id`, `created_at`, `config` JSON, `metrics` JSON, `per_question` JSON).
- **Admin trigger.** `POST /api/admin/evals/run` as a background job, the same pattern as sync. `GET /api/admin/evals` lists runs.
- **Baseline.** Run once on current retrieval and record it in `docs/phase0-findings.md`.

### 2.2 Postgres chunk mirror
- **New table `chunks`:**
  - `id` (same id as Zilliz), `document_id` FK, `google_doc_id`, `chunk_index`, `heading`, `text`.
  - `tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(heading,'')), 'A') || setweight(to_tsvector('english', text), 'B')) STORED` with a GIN index.
  - `embedding vector(384)`.
  - `map_x`, `map_y` (real, nullable).
- **Write path.** Write chunks in the same place ingestion upserts to Zilliz: delete-then-insert per doc, mirroring `delete_chunks_for_doc` and `upsert_chunks`.
- **Backfill.** `python -m app.sync.backfill_chunks` re-chunks and re-embeds from source. It must not re-call Gemini parse, so it reads from Zilliz (`query` by `doc_id`, which has text, heading and chunk_index) and re-embeds locally.

### 2.3 Hybrid retrieval
- **Dense:** top 20 from Zilliz.
- **Lexical:** top 20 from Postgres, `websearch_to_tsquery('english', q)` ranked by `ts_rank_cd`.
- **Course codes:** normalise in both query and index (`IS 459` ↔ `IS459`); a generated `simple`-config tsvector over the raw tokens is acceptable.
- **Fusion:** Reciprocal Rank Fusion (k = 60) → top 6.
- **Neighbour expansion:** if the top hit's neighbour (`chunk_index ± 1`, same heading) is not already in the set, append it (one cheap PG query).
- **Optional rerank:** `cross-encoder/ms-marco-MiniLM-L-6-v2` via `sentence_transformers.CrossEncoder` (no new dependency) over the fused top 20. Keep it only if eval improves recall@5 or MRR by ≥ 3 points and p95 latency on the VM stays < 400 ms.
- **Ship rule:** only ship a change that beats or equals baseline on the golden set. Log each config's metrics.

### 2.4 Decision D1: Zilliz vs pgvector for dense search
Run the same golden set with dense retrieval from pgvector (HNSW, cosine) against Zilliz. Report recall, MRR and latency. **Don't switch automatically.** Present the numbers to Toby. Zilliz is on his resume, and "benchmarked both" is a better story either way.

---

## Phase 3: Chat v2

### 3.1 Conversation memory
- **Store.** Redis list `conv:{session_id}`: last 6 turns, each `{q, a[:600]}`, TTL = session TTL.
- **Condense.** If history exists, rewrite the question into a standalone one with gpt-4o-mini, `max_tokens=80`, temperature 0. Retrieval and the cache key both use the condensed question.
- **Answer prompt.** Gets the last 2 turns verbatim so the answer reads naturally.
- **Logging.** New column `queries.rewritten_question` (migration). Admin recent-queries view shows both.
- **Eval.** Golden set follow-up pairs must pass.

### 3.2 Richer stream events
Extend NDJSON (keep existing event types backward-compatible):
- `sources`: per source, `{google_doc_id, title, module, chunk_ids[], best_score}`.
- `trace` (new, sent with `done`): `{retrieval: [{chunk_id, heading, doc_title, dense_rank, lexical_rank, fused_score}], rewritten_question, cache_hit, response_ms, model, tokens_in, tokens_out}`. Use `stream_options={"include_usage": True}` on OpenAI.
- `followups` (new): 2–3 suggested next questions built **without an LLM** from the headings of retrieved chunks the answer didn't cover (e.g. "What did Toby learn about <heading>?"). Deduplicate against history.

### 3.3 Inline citations
- Number the context blocks in the prompt (`[1]`, `[2]`, …) and instruct the model to cite them inline.
- The frontend renders `[n]` as small superscript buttons. Clicking one highlights its source chip, and "Open note" goes to `/notes/[docId]#chunk-<index>`.
- Strip citations from the cached answer only if they break when cache hits reuse sources (they shouldn't, since sources are cached with the answer). Verify.

### 3.4 Panel UX
- Drawer or sheet per §3.6. Message actions: copy, 👍/👎 (existing).
- **"How this was answered" disclosure:**
  - Bar chart of fused scores (plain divs).
  - Dense vs lexical rank columns.
  - Rewritten question, latency, cache hit, model, tokens.
  - Mini knowledge map with the retrieved chunks pulsing (§8, after Phase 6).
- "New chat" clears `conv:` history (`DELETE /api/conversation`).
- Answer streaming keeps the existing NDJSON reader. `TextShimmer` shows until the first delta.

---

## Phase 4: JD matcher (signature feature)

### 4.1 Backend: `POST /api/match`
- **Request:** `{jd: str (≤ 8000 chars), session_id}`. Separate per-IP limit (`match_rate_limit_per_hour`), and it counts against the OpenAI budget.
- **Cache:** sha256 of the normalised JD → return the stored result.
- **Pipeline, streamed as NDJSON:**
  1. **Extract.** gpt-4o-mini, JSON mode → ≤ 10 requirements `{id, text, kind: tool|technique|domain|soft, must_have}`. Emit a `requirements` event.
  2. **Retrieve.** Per requirement, hybrid top 4 chunks. Also match requirement text against `Skill.name` (case-insensitive, token overlap) and the module outline lines. No LLM in this step.
  3. **Grade.** One gpt-4o-mini call grades every requirement given its evidence → `{id, verdict: strong|partial|gap, rationale (≤ 25 words), evidence_chunk_ids[]}`.
     - System prompt: grade only from the evidence, prefer "gap" when unsure, never invent experience.
     - Emit `row` events one at a time (parse the JSON array incrementally, or emit all after the call and let the UI stagger).
  4. **Summarise.** `summary` event: counts per verdict, plus a three-line "where Toby fits / where Toby would grow" written **from the graded rows only** (same call or a tiny second call).
- **Persist** to new table `matches` (`id`, `created_at`, `jd_hash`, `jd_excerpt[:300]`, `company_guess`, `ref`, `result` JSON, `session_id`). `company_guess` comes from the extraction call.
- **`GET /api/match/{id}`** returns a stored result.

### 4.2 Frontend: `/match`
- Paste area with a character counter and "Try an example JD" (three sample public JDs stored in the repo: analytics engineer, FP&A analyst, data scientist).
- **Streaming results table:** requirement · must-have badge · verdict pill · rationale · evidence chips (open the note page). Rows animate in.
- Header: fit summary with verdict counts as a segmented bar.
- **Actions:**
  - "Ask a follow-up about this role": opens chat with the JD's requirements injected as a short context line in the session (`PATCH` session blob), so answers can reference the role.
  - "Copy link" → `/match/[id]`.
  - "Save as PDF": a print stylesheet plus `window.print()`, no library.
- **Honesty UI:** gaps are shown plainly, with "Toby hasn't documented this in his notes yet." No spin.

**Done when:** a pasted JD streams rows within about 6 s on the VM; a repeat paste is instant from cache; a gap is never upgraded by the UI.

---

## Phase 5: Evidence-backed skills and note pages

### 5.1 Backend
- **`GET /api/skills/evidence`:** for each public skill → `{name, category, docs: [{google_doc_id, display_name, module, grade}], count}`. One query over `document_skills` joined with documents (approved only) and folders. Cache it and invalidate on curation writes.
- **`GET /api/notes/{google_doc_id}`** (public, approved only) →
  - `{display_name, summary, skills, module_path, grade, last_synced_at, outline: [{chunk_index, heading}], related: [{google_doc_id, display_name}]}`.
  - `outline` is the distinct headings from `chunks`, in order.
  - `related` is the 4 nearest docs by cosine between mean doc embeddings (pgvector `<=>` on an `AVG(embedding)` CTE, or computed at ingest into a `doc_embeddings` table if the query is slow).

### 5.2 Frontend
- Skill chips with count badges and an evidence popover (§3.6).
- **Decision D2:** note pages show summary + heading outline + skills + related notes. **No full note text** unless Toby says otherwise.
- `/notes/[docId]`: server component with ISR, `generateMetadata`, per-note OG image.
  - "Ask about this note" opens chat scoped to the doc. Add an optional `doc_id` to the query request; retrieval filters on it in both Zilliz (`filter='doc_id == "…"'`) and PG.
- `DocModal` on the homepage morphs from the card (MorphingDialog) and links to the full note page.

---

## Phase 6: Knowledge map (showpiece)

### 6.1 Backend
- **Projection job** `app.rag.projection.recompute()`:
  - Load all `chunks.embedding`.
  - Use t-SNE (sklearn, `random_state=42`, perplexity ~30) if Phase 0 confirmed sklearn; otherwise PCA via `numpy.linalg.svd`.
  - Normalise to [0, 1] and write `map_x` / `map_y`.
  - Run after each ingest batch and sync that changed anything, and via `POST /api/admin/map/recompute`. Never per request.
- **`GET /api/map`** → `{points: [{id, x, y, doc, module_top, heading}], modules: [{key, name}]}`. No text. Cache in Redis until the next recompute, and send compact arrays. Size it in Phase 0; expect < 200 KB gzipped.
  - `module_top` = the top-level folder, used for colour.

### 6.2 Frontend
- **Canvas renderer** (hand-rolled, no chart library):
  - Categorical palette of ≤ 8 tokens with dark-mode variants.
  - Hover hit-test via a uniform grid; tooltip shows heading + note.
  - Click opens the note page at that chunk.
  - Legend chips toggle modules. Pinch and wheel zoom (reuse the logic in `components/ui/PinchZoomImage.tsx` where sensible).
- **Live link to chat:** when an answer's `trace` arrives, the retrieved chunk points pulse (amber ring, staggered) and the view eases toward their centroid. This also appears as a mini map in "How this was answered".
- **Static fallback:** under `prefers-reduced-motion`, highlight without pulsing. With no JS, render a server-side SVG snapshot.

---

## Phase 7: Command palette

- **`GET /api/search?q=`** (public, `search_rate_limit_per_hour`, **no LLM**): hybrid retrieval → top 8 `{google_doc_id, display_name, heading, chunk_index, snippet}`. `snippet` comes from `ts_headline` over the chunk (≤ 180 chars, `<mark>`-highlighted; sanitise and render with a whitelist).
- **⌘K palette** (hand-rolled, about 200 lines, no `cmdk` package):
  - Sections: Notes (live results, debounced 150 ms) · Actions ("Ask: <query>", "Match a job description", "Download resume", "How this site works", toggle theme).
  - Full keyboard support and combobox ARIA.

---

## Phase 8: Owner tools (admin, private)

### 8.1 Tracked links
- **Admin "Links" panel:** create `{label, ref}` (e.g. "Stripe – Analytics Eng", `stripe-ae`) → copyable `https://<site>/?ref=stripe-ae`.
- Store in a new table `ref_links`.
- **Lightweight visit log.** New table `visits` (`ref`, `path`, `created_at`, `ua_kind`: mobile/desktop/bot). Written once per browser session on first load, via `POST /api/visit` (rate-limited; drop bots by UA).
- **Per ref, show:** first and last visit, visits, chat sessions, questions asked, matches run.
- Footer line: "This site records anonymous usage to improve the chat." **Decision D6:** Toby approves the wording.

### 8.2 Insights tab (admin)
- Queries per day (plain SVG sparkline), by role, industry and ref.
- **Question clusters:** nightly job embeds logged questions, then greedy cosine clustering (threshold ~0.8, numpy) → top clusters with counts and a representative question.
- **Gap list:** questions that got `NO_CONTEXT_ANSWER`, top fused score below a threshold, or 👎. Each row offers "Draft a note outline", which uses the planning model (Gemini free) and stays owner-only.
- Recent JD matches, with company guess, verdict counts and a link.
- Eval trend (from `eval_runs`) and today's OpenAI spend.

### 8.3 Resume → structured experience (optional)
- On resume upload, Gemini (offline, free) extracts `{experience: [{org, role, period, bullets[]}], projects: […]}` into a `resume_structured` JSON column.
- Owner approves it in ProfileEditor.
- The homepage shows an Experience timeline under the hero. The chat still uses the raw resume text.

### 8.4 Budget guard
- After each OpenAI call, add the estimated cost from `usage` to Redis `spend:{YYYY-MM-DD}` (prices in config).
- If the day exceeds `daily_openai_budget_usd`, visitor answers switch to Gemini (existing fallback path). If Gemini then fails, show "The assistant is resting for today. Try search (⌘K) or the JD matcher tomorrow." JD match is disabled for the day.

---

## Phase 9: OCR fallback experiment (optional, low priority)

**Context.** Baidu Unlimited-OCR:
- 3B MoE with about 0.5B active parameters, MIT licence, released June 2026.
- Reported 93.2 on OmniDocBench v1.5, compared only against DeepSeek-OCR.
- 32K context. GGUF builds run in about 6–8 GB RAM.

**Scope**
- Do **not** replace Gemini parse.
- Only evaluate it as the fallback for when Gemini fails or quota is exhausted. Today that case degrades to `parse_status = "fallback"`, meaning text inside images is missing.

**Experiment**
- Run it on Toby's laptop (WSL2, via Ollama or llama.cpp), not on the VM, over every doc currently marked `fallback` plus 5 image-heavy docs.
- Compare against Gemini output on character accuracy for the image text, and on whether diagram-only images (no text) yield anything useful.

**Adopt only if** it recovers most of the image text on the fallback docs.
- **If adopted:** an admin-only "Re-parse with local OCR" path that accepts the OCR text uploaded from the laptop. Not a service on the VM; the 4 GB backend limit and the CPU-only ARM VM make serving it there a poor trade.

---

## 10. Open decisions for Toby (ask before the phase that needs them)

| ID | Decision | Needed by |
|---|---|---|
| D1 | Serve dense search from Zilliz or pgvector, after benchmark numbers | End of Phase 2 |
| D2 | Note pages: outline only (default) or excerpts or full text | Phase 5 |
| D3 | `motion` dependency approved as the one animation library | Phase 1 (default: yes) |
| D4 | JD match results shareable by link and stored | Phase 4 (default: yes) |
| D5 | Display name: "Toby Chan" vs "Chan Ngok Jung Toby" | Phase 1 |
| D6 | Usage-tracking notice wording | Phase 8 |
| D7 | Golden question set approval | Phase 2 |

---

## 11. Definition of done (every phase)

- Backend endpoints exercised in Swagger, with example request and response pasted in the PR description.
- Eval run attached for any retrieval or prompt change; no regression versus the last accepted run.
- 375px, 768px and 1280px screenshots in light and dark mode for UI changes.
- Keyboard-only walkthrough of new UI.
- No new dependencies beyond §0 and §3.5.
- `/stack` page text updated if architecture changed (it documents the pipeline publicly; keep it honest).
- README "Stack" section corrected if models or services changed.
