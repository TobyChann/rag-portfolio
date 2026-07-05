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
  { num:"01", title:"Trigger and auth", body:"Google Cloud push webhooks fire on Doc edits, delivering a signed payload to the FastAPI /webhook/drive endpoint. A service account with read-only Drive scope handles server-to-server auth with no OAuth flow required.", tags:["Google Drive API","Service account"] },
  { num:"02", title:"Document parsing", body:"The backend exports the changed Doc as PDF via the Drive API and passes it to IBM's Docling parser, which cleanly extracts layout structure, tables, image captions, and reading order from mixed-content pages.", tags:["Docling","PDF export"] },
  { num:"03", title:"Chunking and embedding", body:"Text is split at heading boundaries with 15 to 20% overlap to preserve context. Each chunk is embedded locally using all-MiniLM-L6-v2 (384 dimensions) via sentence-transformers with no external API call and zero embedding cost.", tags:["all-MiniLM-L6-v2","sentence-transformers"] },
  { num:"04", title:"Storage and sync", body:"Embeddings are upserted to Zilliz Cloud (managed Milvus) under a per-document filter so re-ingestion atomically replaces stale vectors. Document metadata and sync timestamps are tracked in Supabase via SQLAlchemy.", tags:["Zilliz Cloud","PyMilvus","Supabase"] },
];

const RAG_STEPS = [
  { num:"01", title:"Rate limiting and session", body:"Incoming queries hit /query which immediately checks Redis for an active IP rate-limit counter (max 20 per hour, TTL-based) and a valid session token set during onboarding. Rejected requests never reach the LLM.", tags:["Redis Cloud","FastAPI dependency"] },
  { num:"02", title:"Cache check", body:"The question is SHA-256 hashed and checked against a Redis key-value store of previous Q&A pairs. A cache hit returns the answer instantly with zero LLM cost.", tags:["Redis","SHA-256 hash"] },
  { num:"03", title:"Semantic vector search", body:"The query is embedded with the same all-MiniLM-L6-v2 model used during ingestion (critical for metric consistency), then fired as an ANN search against Zilliz using cosine similarity. Top K=5 chunks are returned.", tags:["Zilliz ANN","Cosine similarity","K=5"] },
  { num:"04", title:"Context synthesis", body:"The five chunk texts are injected into an engineered system prompt alongside the original question and sent to gemini-2.5-flash. Temperature is set to 0.2 for factual answers. Max output is 500 tokens.", tags:["gemini-2.5-flash","LangChain","temp=0.2"] },
  { num:"05", title:"Observability", body:"Every step including retrieved chunk contents, embedding latency, LLM token counts, and end-to-end response time is pushed to LangSmith for prompt performance tracing and regression detection.", tags:["LangSmith","LangChain tracing"] },
];

const JUSTIFICATIONS = [
  { component:"Vector search metric",   choice:"Cosine similarity",         reason:"Best suited for normalized embeddings from all-MiniLM-L6-v2, giving consistent 0 to 1 scores independent of chunk length." },
  { component:"Embedding model",         choice:"all-MiniLM-L6-v2 (local)",  reason:"Runs locally inside the container with zero API cost or latency. 384 dimensions balances quality and storage efficiency." },
  { component:"Document parser",         choice:"IBM Docling",                reason:"Handles complex layouts, structural markdown, and mixed text and image pages. PyMuPDF alone loses reading order in multi-column docs." },
  { component:"Backend hosting",         choice:"Railway (containerised)",    reason:"Keeps the process alive, avoiding serverless cold-start penalties. Vercel Functions time out at 10 seconds. RAG pipelines take 15 to 25 seconds." },
  { component:"Cache strategy",          choice:"Redis exact-match",          reason:"SHA-256 match eliminates identical repeat queries instantly. Semantic caching via LangChain and Zilliz is the next planned upgrade." },
  { component:"Auto-sync mechanism",     choice:"Google Drive push webhooks", reason:"Event-driven re-ingestion triggers only on actual edits, no polling. Only the changed document is re-chunked and re-embedded." },
];

const STACK = [
  { name:"FastAPI",            role:"Backend framework",     reason:"Async Python, auto Swagger docs, industry standard for ML APIs",                   tag:"backend" },
  { name:"Next.js",            role:"Frontend framework",    reason:"File-based routing, SSR, zero-config Vercel deploys",                               tag:"frontend" },
  { name:"Zilliz Cloud",       role:"Vector database",       reason:"Managed Milvus, stores and searches 384-dim embeddings at scale",                   tag:"ai" },
  { name:"all-MiniLM-L6-v2",  role:"Embedding model",       reason:"Free local HuggingFace model, zero API cost, strong semantic understanding",          tag:"ai" },
  { name:"gemini-2.5-flash",        role:"LLM",                   reason:"Cost-efficient OpenAI model sufficient for RAG answer generation",                  tag:"ai" },
  { name:"LangChain",          role:"RAG orchestration",     reason:"Standard library for chaining retrieval and generation pipelines",                  tag:"ai" },
  { name:"LangSmith",          role:"LLM observability",     reason:"Traces every RAG call including latency, retrieved chunks, and token usage",        tag:"observability" },
  { name:"Docling",            role:"Document parsing",      reason:"IBM PDF parser handling mixed text and image documents natively",                   tag:"ai" },
  { name:"Supabase",           role:"Postgres database",     reason:"Managed Postgres for visitor logs, query history, and analytics",                   tag:"data" },
  { name:"Redis Cloud",        role:"Cache and rate limiting",reason:"Q&A cache, IP rate limiting, session state. Three jobs, one tool.",                tag:"infra" },
  { name:"Google Drive API",   role:"Auto-sync",             reason:"Push webhooks re-index docs on every edit, no polling required",                    tag:"infra" },
  { name:"Docker",             role:"Containerisation",      reason:"Reproducible local dev, portable Railway deployment",                              tag:"infra" },
  { name:"Railway",            role:"Backend hosting",       reason:"Free tier, no serverless timeout. Critical for 15 to 25 second RAG pipelines.",    tag:"infra" },
  { name:"Vercel",             role:"Frontend hosting",      reason:"Zero-config Next.js deploys, free tier, global CDN",                               tag:"infra" },
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
          RAGPortfolio is a production-ready, asynchronous Retrieval-Augmented Generation pipeline
          that dynamically synchronises an external knowledge base with a vector database using
          automated event webhooks.
        </p>
        <div style={{
          display:"flex", flexWrap:"wrap", gap:8, padding:"14px 18px",
          background:"var(--bg-secondary)", borderRadius:"var(--radius-md)",
          border:"1px solid var(--border)", fontSize:12,
        }}>
          {[
            ["Embedding model","all-MiniLM-L6-v2 · 384-dim"],
            ["LLM","gemini-2.5-flash"],
            ["Vector DB","Zilliz Cloud (Milvus)"],
            ["Backend","FastAPI · Railway"],
            ["Frontend","Next.js · Vercel"],
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