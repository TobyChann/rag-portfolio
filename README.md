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
`OPENAI_RAG_MODEL`, `TAG_MODEL`, `PARSE_MODEL`, `RAG_MODEL`, `HF_TOKEN`).
Add your `service-account.json` to `backend/`.

### 2. Start locally
```bash
docker-compose up
```

### 3. First-time ingestion
Log in to `/admin`, pick notes with the Drive picker to ingest them, then use **Sync** to
re-ingest any notes edited since their last sync (`POST /api/admin/sync`).

### 4. Test RAG
POST /api/onboard  { "role": "recruiter", "industry": "Tech" }
POST /api/query    { "question": "What databases do you know?", "session_id": "..." }

### 5. Deploy
Frontend → Vercel (connect GitHub repo, set NEXT_PUBLIC_API_URL)
Backend  → Railway (connect GitHub repo, add env vars)