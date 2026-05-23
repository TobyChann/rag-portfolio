const STACK = [
  { name: "FastAPI", role: "Backend framework", reason: "Async-first Python, auto Swagger docs, industry standard for ML APIs", tag: "Backend" },
  { name: "Next.js", role: "Frontend framework", reason: "File-based routing, SSR, deploys zero-config to Vercel", tag: "Frontend" },
  { name: "Zilliz Cloud", role: "Vector database", reason: "Managed Milvus — stores and searches 384-dim embeddings at scale", tag: "AI" },
  { name: "all-MiniLM-L6-v2", role: "Embedding model", reason: "Free local HuggingFace model, 384 dims, strong semantic understanding", tag: "AI" },
  { name: "GPT-4o-mini", role: "LLM", reason: "Cost-efficient OpenAI model, sufficient for RAG answer generation", tag: "AI" },
  { name: "LangChain", role: "RAG orchestration", reason: "Standard library for chaining retrieval + generation pipelines", tag: "AI" },
  { name: "Supabase", role: "Postgres database", reason: "Managed Postgres for visitor logs, query history, analytics", tag: "Data" },
  { name: "Redis", role: "Cache + rate limiting", reason: "Q&A cache, IP rate limiting, session state", tag: "Infra" },
  { name: "Docling", role: "Document parsing", reason: "IBM PDF parser handling mixed text + image documents natively", tag: "AI" },
  { name: "Google Drive API", role: "Document sync", reason: "Push webhooks auto-re-index docs on every edit", tag: "Infra" },
  { name: "Docker", role: "Containerisation", reason: "Reproducible local dev, portable deployment to Railway", tag: "Infra" },
  { name: "LangSmith", role: "LLM observability", reason: "Traces every RAG call — latency, retrieved chunks, token usage", tag: "Observability" },
  { name: "Railway", role: "Backend hosting", reason: "Free tier, no serverless timeout limits", tag: "Infra" },
  { name: "Vercel", role: "Frontend hosting", reason: "Zero-config Next.js deploys, free tier, global CDN", tag: "Infra" },
];

const TAG_COLORS: Record<string, string> = {
  Backend: "bg-blue-50 text-blue-700",
  Frontend: "bg-purple-50 text-purple-700",
  AI: "bg-orange-50 text-orange-700",
  Data: "bg-green-50 text-green-700",
  Infra: "bg-gray-100 text-gray-600",
  Observability: "bg-yellow-50 text-yellow-700",
};

export default function StackPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-xl font-medium text-gray-900 mb-2">How this works</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        This portfolio uses a RAG pipeline to answer questions about my background.
        Documents live in Google Docs and auto-sync to a vector database whenever I edit them.
      </p>
      <div className="border border-dashed border-gray-300 rounded-xl p-6 mb-8 text-center text-sm text-gray-400">
        Google Docs → Docling → Embeddings → Zilliz → GPT-4o-mini
      </div>
      <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">Stack</h2>
      <div className="flex flex-col divide-y divide-gray-100">
        {STACK.map(item => (
          <div key={item.name} className="py-3 flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{item.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[item.tag]}`}>{item.tag}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{item.role}</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
