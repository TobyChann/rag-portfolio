"use client";
import { useState } from "react";
import PinchZoomImage from "@/components/ui/PinchZoomImage";

type Tab = "c1" | "c2" | "c3";

const C4_TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "c1", label: "C1 — Context",    desc: "Who interacts with the system and what external services does it depend on?" },
  { id: "c2", label: "C2 — Containers", desc: "What are the deployed pieces and how do they communicate?" },
  { id: "c3", label: "C3 — Components", desc: "What are the internal modules inside the FastAPI backend?" },
];

const LEGENDS: Record<Tab, { color: string; label: string }[]> = {
  c1: [
    { color: "#93C5FD", label: "People" },
    { color: "#6EE7B7", label: "Core system" },
    { color: "#FCD34D", label: "External services" },
    { color: "#FCA5A5", label: "Databases" },
  ],
  c2: [
    { color: "#93C5FD", label: "Frontend" },
    { color: "#6EE7B7", label: "Backend" },
    { color: "#FCD34D", label: "Cache" },
    { color: "#FCA5A5", label: "Databases" },
    { color: "#C4B5FD", label: "External APIs" },
  ],
  c3: [
    { color: "#C4B5FD", label: "API routes" },
    { color: "#6EE7B7", label: "RAG pipeline" },
    { color: "#FCD34D", label: "Sync / ingestion" },
    { color: "#93C5FD", label: "Cache / data layer" },
  ],
};

const INGESTION_STEPS = [
  { num:"01", title:"Source and sync", body:"Notes live as Google Docs in a Drive folder, read through a service account with a read-only scope (no OAuth flow). New notes are added deliberately through the admin Drive picker; a delta sync then compares each Doc's modifiedTime against its stored last_synced_at and re-ingests only the documents that actually changed.", tags:["Google Drive API","Service account","Delta sync"] },
  { num:"02", title:"Multimodal parsing", body:"Text-only Docs are exported straight to text. Docs containing images, diagrams, or screenshots are exported as PDF and passed to Gemini 3.5 Flash, which transcribes every visible character — including text baked into images — and infers heading levels into clean Markdown. If that parse fails, it falls back to a plain-text export and flags the note so the miss is never silent.", tags:["Gemini 3.5 Flash","PDF export","Fallback status"] },
  { num:"03", title:"Chunking and embedding", body:"Markdown is split at heading boundaries to preserve topic context, with long sections further split at roughly 20% character overlap. Each chunk is embedded locally with all-MiniLM-L6-v2 (384 dimensions) via sentence-transformers — no external API call and zero embedding cost.", tags:["all-MiniLM-L6-v2","sentence-transformers","384-dim"] },
  { num:"04", title:"Storage and tagging", body:"Chunks are deleted and re-upserted per document into Zilliz Cloud (managed Milvus), so re-ingesting a note atomically replaces its stale vectors and nothing else. Document metadata, chunk counts, and sync timestamps are tracked in Supabase Postgres via async SQLAlchemy. A separate Gemini 3.1 Flash Lite pass drafts a summary and extracts skill tags for the portfolio.", tags:["Zilliz Cloud","PyMilvus","Supabase","Gemini 3.1 Flash Lite"] },
];

const RAG_STEPS = [
  { num:"01", title:"Rate limiting and session", body:"Incoming visitor queries hit /query, which first checks Redis for a per-IP rate-limit counter (20 per hour, 1-hour TTL) and a valid session token created during onboarding. Rejected requests never reach the embedding model or the LLM.", tags:["Redis","FastAPI dependency"] },
  { num:"02", title:"Cache check", body:"The question is normalised and SHA-256 hashed into a Redis key holding previous answers. A cache hit returns the stored answer instantly with zero LLM cost; entries live for 24 hours.", tags:["Redis","SHA-256 hash","24h TTL"] },
  { num:"03", title:"Semantic vector search", body:"On a miss, the query is embedded with the same all-MiniLM-L6-v2 model used at ingestion (metric consistency matters) and run as an ANN search against Zilliz using cosine similarity. The top K=5 chunks are returned with their source titles and headings.", tags:["Zilliz ANN","Cosine similarity","K=5"] },
  { num:"04", title:"Answer generation", body:"The five retrieved chunks are injected into an engineered system prompt alongside the question and sent to Gemini 3.5 Flash through its OpenAI-compatible endpoint (the official openai SDK — no LangChain). Temperature is 0.2 for factual answers, output is capped at 1024 tokens, and thinking is disabled so the whole budget goes to the visible reply. The answer is then written back to the Redis cache.", tags:["Gemini 3.5 Flash","openai SDK","temp=0.2"] },
];

const JUSTIFICATIONS = [
  { component:"Vector search metric",   choice:"Cosine similarity",              reason:"Best suited to the normalized embeddings from all-MiniLM-L6-v2, giving consistent scores independent of chunk length." },
  { component:"Embedding model",         choice:"all-MiniLM-L6-v2 (local)",       reason:"Runs locally inside the container with zero API cost or latency. 384 dimensions balances quality and storage efficiency." },
  { component:"Document parser",         choice:"Gemini 3.5 Flash (multimodal)",  reason:"Transcribes text baked into images, diagrams, and screenshots that a plain text export silently drops — one model, no separate OCR or layout dependency." },
  { component:"Backend runtime",         choice:"Docker + Uvicorn (long-lived)",  reason:"A persistent containerised process avoids serverless cold-start and timeout penalties — a full RAG query can take 15 to 25 seconds end to end." },
  { component:"Cache strategy",          choice:"Redis exact-match",              reason:"A SHA-256 match eliminates identical repeat queries instantly at zero cost. Semantic (embedding-based) caching is the next planned upgrade." },
  { component:"Sync mechanism",          choice:"Delta sync on modifiedTime",     reason:"Re-ingestion compares Drive's modifiedTime against the last sync and re-processes only changed docs — no full re-index. New files are added deliberately via the picker." },
];

const STACK = [
  { name:"FastAPI",              role:"Backend framework",      reason:"Async Python with automatic OpenAPI docs — a natural fit for I/O-bound RAG endpoints.",              tag:"backend" },
  { name:"Next.js",              role:"Frontend framework",     reason:"App Router and React with file-based routing for the portfolio, chat, and admin surfaces.",         tag:"frontend" },
  { name:"Zilliz Cloud",         role:"Vector database",        reason:"Managed Milvus — stores and searches the 384-dim chunk embeddings with cosine ANN.",                tag:"ai" },
  { name:"all-MiniLM-L6-v2",    role:"Embedding model",        reason:"Local HuggingFace model run via sentence-transformers — zero API cost, strong semantic recall.",    tag:"ai" },
  { name:"Gemini 3.5 Flash",     role:"LLM + multimodal parse", reason:"Google's model, via its OpenAI-compatible endpoint: generates RAG answers and transcribes image-bearing notes to Markdown.", tag:"ai" },
  { name:"Gemini 3.1 Flash Lite",role:"Auto-tagging",           reason:"Higher free-tier throughput for the formulaic pass that drafts note summaries and extracts skills.",  tag:"ai" },
  { name:"sentence-transformers",role:"Embedding runtime",      reason:"Runs the MiniLM model locally inside the container for both ingestion and query embedding.",         tag:"ai" },
  { name:"Supabase",             role:"Postgres database",      reason:"Managed Postgres for document metadata, sync timestamps, visitor logs, and query history.",          tag:"data" },
  { name:"SQLAlchemy",           role:"Async ORM",              reason:"Async models over the asyncpg driver — one data layer for documents, courses, skills, and chats.",  tag:"data" },
  { name:"Redis",                role:"Cache and rate limiting",reason:"Q&A cache, per-IP rate limiting, and session state. Three jobs, one tool.",                          tag:"infra" },
  { name:"Google Drive API",     role:"Note source + sync",     reason:"Service-account read access to the notes folder; delta sync re-ingests only changed docs.",          tag:"infra" },
  { name:"Docker",               role:"Containerisation",       reason:"Reproducible builds and a long-lived process — no serverless timeout on 15–25s RAG queries.",       tag:"infra" },
];

const TAG_STYLES: Record<string, string> = {
  backend:"tag tag-teal", frontend:"tag tag-purple", ai:"tag tag-amber",
  data:"tag tag-green", infra:"tag tag-gray", observability:"tag tag-blue",
};

function Collapsible({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", overflow:"hidden", marginBottom:12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"14px 20px", background:"var(--bg-secondary)", border:"none", cursor:"pointer",
          transition:"background .15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-tertiary)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, fontWeight:600, color:"var(--fg)" }}>{title}</span>
          {badge && <span className="tag tag-gray" style={{ fontSize:11 }}>{badge}</span>}
        </div>
        <span style={{
          fontSize:16, color:"var(--fg-muted)",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition:"transform .2s", display:"inline-block",
        }}>&#8964;</span>
      </button>
      <div style={{ maxHeight: open ? 5000 : 0, overflow:"hidden", transition:"max-height .35s ease" }}>
        <div style={{ padding:"20px 24px", background:"var(--bg)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}


function PipelineStep({ num, title, body, tags, accent, isLast }: {
  num:string; title:string; body:string; tags:string[]; accent:string; isLast:boolean;
}) {
  return (
    <div style={{ display:"flex", gap:16, paddingBottom: isLast ? 0 : 8 }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
        <div style={{
          width:32, height:32, borderRadius:"50%", background:accent,
          color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontWeight:700, flexShrink:0,
        }}>{num}</div>
        {!isLast && <div style={{ width:1, flex:1, minHeight:16, background:"var(--border)", margin:"4px 0" }} />}
      </div>
      <div style={{ paddingBottom: isLast ? 0 : 20, flex:1 }}>
        <p style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{title}</p>
        <p style={{ fontSize:13, color:"var(--fg-muted)", lineHeight:1.7, marginBottom:10 }}>{body}</p>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {tags.map(t => <span key={t} className="tag tag-gray">{t}</span>)}
        </div>
      </div>
    </div>
  );
}

export default function StackPage() {
  const [activeTab, setActiveTab] = useState<Tab>("c1");

  return (
    <main style={{ maxWidth:720, margin:"0 auto", padding:"48px 24px 80px" }}>

      <section style={{ marginBottom:40 }}>
        <h1 style={{ fontSize:22, fontWeight:500, marginBottom:10 }}>How this works</h1>
        <p style={{ fontSize:14, color:"var(--fg-muted)", lineHeight:1.8, marginBottom:20 }}>
          RAGPortfolio is an asynchronous Retrieval-Augmented Generation pipeline that keeps a
          vector database in sync with a Google Drive knowledge base and answers questions over it.
          Notes are parsed (multimodally when they contain images), embedded locally, and retrieved
          on demand — and re-ingestion only touches the documents that actually changed.
        </p>
        <div style={{
          display:"flex", flexWrap:"wrap", gap:8, padding:"14px 18px",
          background:"var(--bg-secondary)", borderRadius:"var(--radius-md)",
          border:"1px solid var(--border)", fontSize:12,
        }}>
          {[
            ["Embedding model","all-MiniLM-L6-v2 · 384-dim"],
            ["LLM","Gemini 3.5 Flash"],
            ["Vector DB","Zilliz Cloud (Milvus)"],
            ["Backend","FastAPI · Docker"],
            ["Frontend","Next.js · React"],
          ].map(([k,v]) => (
            <div key={k} style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ color:"var(--fg-subtle)", fontWeight:500 }}>{k}</span>
              <span style={{
                background:"var(--accent-light)", color:"var(--accent-text)",
                padding:"2px 8px", borderRadius:20, fontWeight:500, fontSize:11,
              }}>{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom:16 }}>
        <p className="section-label">Architecture diagrams · C4 model</p>
        <div className="tab-strip">
          {C4_TABS.map(t => (
            <button key={t.id} className={`tab-item${activeTab===t.id?" active":""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize:12, color:"var(--fg-subtle)", marginBottom:12 }}>
          {C4_TABS.find(t => t.id===activeTab)?.desc}
        </p>
        <div key={activeTab} className="fade-in">
          <PinchZoomImage
            src={`/diagrams/${activeTab}.png`}
            alt={`C4 ${activeTab.toUpperCase()} architecture diagram`}
            fallbackLabel={`Drop public/diagrams/${activeTab}.png to load this diagram`}
          />
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginTop:12, marginBottom:32 }}>
          {LEGENDS[activeTab].map(l => (
            <div key={l.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:l.color }} />
              <span style={{ fontSize:12, color:"var(--fg-muted)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom:16 }}>
        <p className="section-label" style={{ marginBottom:12 }}>Pipeline documentation</p>

        <Collapsible title="Pipeline A: Ingestion engine" badge="write path" defaultOpen>
          <p style={{ fontSize:13, color:"var(--fg-muted)", lineHeight:1.7, marginBottom:20 }}>
            Triggered automatically whenever a Google Doc is edited. Only the changed document
            is re-processed. The rest of the corpus is untouched.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {INGESTION_STEPS.map((s,i) => (
              <PipelineStep key={i} {...s} accent="var(--accent)" isLast={i===INGESTION_STEPS.length-1} />
            ))}
          </div>
        </Collapsible>

        <Collapsible title="Pipeline B: RAG query loop" badge="read path">
          <p style={{ fontSize:13, color:"var(--fg-muted)", lineHeight:1.7, marginBottom:20 }}>
            Every employer query runs through rate limiting and cache checks before touching
            the LLM, keeping costs minimal even under repeated use.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {RAG_STEPS.map((s,i) => (
              <PipelineStep key={i} {...s} accent="#6366F1" isLast={i===RAG_STEPS.length-1} />
            ))}
          </div>
        </Collapsible>

        <Collapsible title="Design justifications" badge={`${JUSTIFICATIONS.length} decisions`}>
          <div style={{ display:"flex", flexDirection:"column" }}>
            {JUSTIFICATIONS.map((j,i) => (
              <div key={i} style={{
                display:"grid",
                gridTemplateColumns:"minmax(120px,150px) minmax(120px,160px) 1fr",
                gap:16, padding:"12px 0",
                borderBottom: i<JUSTIFICATIONS.length-1 ? "1px solid var(--border)" : "none",
                alignItems:"start",
              }}>
                <span style={{ fontSize:12, color:"var(--fg-muted)", fontWeight:500 }}>{j.component}</span>
                <span style={{ fontSize:12, fontWeight:600 }}>{j.choice}</span>
                <span style={{ fontSize:12, color:"var(--fg-muted)", lineHeight:1.7 }}>{j.reason}</span>
              </div>
            ))}
          </div>
        </Collapsible>

        <Collapsible title="Full stack reference" badge={`${STACK.length} tools`}>
          <div style={{ display:"flex", flexDirection:"column" }}>
            {STACK.map((item,i) => (
              <div key={item.name} style={{
                display:"flex", alignItems:"flex-start", gap:16, padding:"10px 0",
                borderBottom: i<STACK.length-1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ minWidth:150 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.name}</span>
                    <span className={TAG_STYLES[item.tag]}>{item.tag}</span>
                  </div>
                  <span style={{ fontSize:11, color:"var(--fg-subtle)", marginTop:2, display:"block" }}>{item.role}</span>
                </div>
                <span style={{ fontSize:12, color:"var(--fg-muted)", lineHeight:1.7, flex:1 }}>{item.reason}</span>
              </div>
            ))}
          </div>
        </Collapsible>
      </section>

    </main>
  );
}