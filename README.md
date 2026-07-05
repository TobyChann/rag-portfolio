# Portfolio RAG Chatbot

RAG-powered portfolio site. Employers can ask questions about skills and coursework via an embedded chatbot backed by Google Docs, Zilliz, and gemini-2.5-flash.

## Stack
Backend: FastAPI · Zilliz Cloud · Redis · Supabase · Docling · LangChain
Frontend: Next.js · Tailwind · Vercel

## Setup

### 1. Clone and configure
```bash
cp backend/.env.example backend/.env
# Fill in all values in backend/.env
# Add your service-account.json to backend/
```

### 2. Start locally
```bash
docker-compose up
```

### 3. First-time ingestion
Visit http://localhost:8000/docs
POST /api/ingest/all  ← triggers full ingestion, watch server logs

### 4. Test RAG
POST /api/onboard  { "role": "recruiter", "industry": "Tech" }
POST /api/query    { "question": "What databases do you know?", "session_id": "..." }

### 5. Register Drive webhooks (after Railway deploy)
Update WEBHOOK_URL in backend/app/sync/watcher.py
```bash
cd backend && python -m app.sync.watcher
```

### 6. Deploy
Frontend → Vercel (connect GitHub repo, set NEXT_PUBLIC_API_URL)
Backend  → Railway (connect GitHub repo, add env vars)