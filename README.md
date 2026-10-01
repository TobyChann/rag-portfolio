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
`CRON_SECRET`, `AUTO_SYNC_INTERVAL_MINUTES`, `SYNC_INGEST_NEW_NOTES`, and in production
`CORS_ORIGINS=https://<your-app>.vercel.app`).
Add your `service-account.json` to `backend/`.

### 2. Start locally
```bash
docker-compose up
```

### 3. Ingestion and sync
Name note docs `Notes_<Module>` in the Drive folder. **Sync** (admin panel, `POST /api/admin/sync`)
re-ingests notes edited since their last sync and adds new `Notes_` docs; other files go through
the admin Drive picker.

Automatic sync — pick one:
- **Vercel Cron** (frontend on Vercel): set `CRON_SECRET` to the same value in the Vercel project
  and in `backend/.env`. `frontend/vercel.json` calls `/api/cron/sync` daily, which forwards to the
  backend's `POST /api/admin/sync/cron`.
- **In-process** (long-lived backend host): set `AUTO_SYNC_INTERVAL_MINUTES=360` (0 = off).
- **Any other scheduler**: `POST <backend>/api/admin/sync/cron` with `Authorization: Bearer $CRON_SECRET`.

### 4. Test RAG
POST /api/onboard  { "role": "recruiter", "industry": "Tech" }
POST /api/query    { "question": "What databases do you know?", "session_id": "..." }

### 5. Deploy
Frontend → Vercel (root directory `frontend`, set NEXT_PUBLIC_API_URL and CRON_SECRET)
Backend  → Railway (connect GitHub repo, add env vars)