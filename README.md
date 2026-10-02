# Portfolio RAG Chatbot

RAG-powered portfolio site. Employers can ask questions about skills and coursework via an embedded chatbot backed by Google Docs and Zilliz. Answers come from gpt-4o-mini; note parsing and tagging run on Gemini.

## Stack
Backend: FastAPI · Zilliz Cloud · Redis · Supabase (Postgres) · sentence-transformers (all-MiniLM-L6-v2)
LLMs: gpt-4o-mini (visitor answers) · Gemini 3.5 Flash (multimodal parsing) · Gemini 3.1 Flash Lite (tagging) · Gemini 2.5 Flash (planning chat)
Frontend: Next.js · Tailwind · Vercel

## Setup

### 1. Clone and configure
Create `backend/.env` with:
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ZILLIZ_URI`, `ZILLIZ_TOKEN`, `DATABASE_URL`, `REDIS_URL`,
`GOOGLE_DRIVE_FOLDER_ID`, `ADMIN_PASSWORD_HASH` (optional: `RAG_PROVIDER=gemini` to answer on Gemini instead,
`OPENAI_RAG_MODEL`, `TAG_MODEL`, `PARSE_MODEL`, `RAG_MODEL`, `PLANNING_MODEL`, `HF_TOKEN`,
`CRON_SECRET`, `AUTO_SYNC_INTERVAL_MINUTES`, `SYNC_INGEST_NEW_NOTES`).
Add your `service-account.json` to `backend/`.

### 2. Start locally
```bash
docker-compose up
```

### 3. Ingestion and sync
Name note docs `Notes_<Module>` in the Drive folder. **Sync** (admin panel, `POST /api/admin/sync`)
re-ingests notes edited since their last sync and adds new `Notes_` docs; other files go through
the admin Drive picker.

Automatic sync: set `AUTO_SYNC_INTERVAL_MINUTES=1440` on the backend (0 = off). Each run also
does a small Zilliz read, which keeps a free-tier cluster from being suspended for inactivity.
An external scheduler can instead call `POST /api/admin/sync/cron` with
`Authorization: Bearer $CRON_SECRET`.

### 4. Test RAG
POST /api/onboard  { "role": "recruiter", "industry": "Tech" }
POST /api/query    { "question": "What databases do you know?", "session_id": "..." }

### 5. Deploy

```
browser ──► Vercel (Next.js) ──/api/*──► Caddy (HTTPS) ──► FastAPI ──► Postgres, Redis
                                         └──────────── OCI VM, docker-compose.prod.yml ───┘
```

The browser only ever talks to the Vercel domain; Vercel forwards `/api/*` to the backend
(`frontend/next.config.mjs`). That keeps the admin cookie first-party and avoids CORS.

**Backend (OCI VM, Ubuntu, Docker):**
1. Point a DNS name (e.g. DuckDNS) at the VM and open ports 80/443 in the VCN security list.
2. Clone the repo, then create:
   - `.env` from `deploy/.env.example` (`API_DOMAIN`, `POSTGRES_PASSWORD`)
   - `backend/.env` (app settings above, plus `AUTO_SYNC_INTERVAL_MINUTES=1440`)
   - `backend/service-account.json`
3. Move the data over once (backend not running yet):
   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   SUPABASE_URL='postgresql://...' deploy/migrate-from-supabase.sh
   ```
4. Start everything: `docker compose -f docker-compose.prod.yml up -d --build`
5. Nightly backups: see the header of `deploy/backup.sh` for the crontab line.

Update after a push: `git pull && docker compose -f docker-compose.prod.yml up -d --build`

**Frontend (Vercel):** import the repo with root directory `frontend` and set
`NEXT_PUBLIC_API_URL=/api` and `BACKEND_URL=https://<API_DOMAIN>`.
