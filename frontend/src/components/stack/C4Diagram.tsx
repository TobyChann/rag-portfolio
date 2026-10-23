// C1–C3 architecture diagrams, redrawn from the draw.io source as inline SVG
// so they follow the site's theme. Coordinates are in each diagram's viewBox.

type Kind = "person" | "core" | "component" | "api" | "sync" | "external" | "db";

interface Node {
  id: string; kind: Kind;
  x: number; y: number; w: number; h: number;
  title: string; tech?: string; desc?: string[];
}
// `at` pins the label where the default (middle of the longest segment) would sit under a box.
interface Edge { from: string; to: string; label?: string; via?: [number, number][]; at?: [number, number] }
interface Boundary { x: number; y: number; w: number; h: number; label: string }
interface Diagram { width: number; height: number; title: string; nodes: Node[]; edges: Edge[]; boundaries?: Boundary[] }

export type C4Level = "c1" | "c2" | "c3";

const FILL: Record<Kind, [string, string]> = {
  person:    ["var(--c4-person)", "var(--c4-person)"],
  core:      ["var(--c4-core)", "var(--c4-core-line)"],
  component: ["var(--c4-component)", "var(--c4-component-line)"],
  api:       ["var(--c4-api)", "var(--c4-api-line)"],
  sync:      ["var(--c4-sync)", "var(--c4-sync-line)"],
  external:  ["var(--c4-external)", "var(--c4-external-line)"],
  db:        ["var(--c4-db)", "var(--c4-db-line)"],
};

export const C4_LEGENDS: Record<C4Level, { kind: Kind; label: string }[]> = {
  c1: [
    { kind: "person", label: "People" },
    { kind: "core", label: "This system" },
    { kind: "external", label: "External services" },
    { kind: "db", label: "Databases" },
  ],
  c2: [
    { kind: "person", label: "People" },
    { kind: "core", label: "Containers" },
    { kind: "db", label: "Data stores" },
    { kind: "external", label: "External services" },
  ],
  c3: [
    { kind: "api", label: "API routes" },
    { kind: "component", label: "RAG pipeline" },
    { kind: "sync", label: "Sync / ingestion" },
    { kind: "core", label: "Cache / data layer" },
    { kind: "external", label: "External services" },
    { kind: "db", label: "Data stores" },
  ],
};

export const legendColor = (kind: Kind) => FILL[kind][0];

const NL = "\n";

const DIAGRAMS: Record<C4Level, Diagram> = {
  c1: {
    width: 1000, height: 580, title: "C1 system context: RAGPortfolio",
    nodes: [
      { id: "owner", kind: "person", x: 170, y: 20, w: 140, h: 125, title: "Owner (Toby)", desc: ["Writes notes,", "curates the site"] },
      { id: "visitor", kind: "person", x: 690, y: 20, w: 140, h: 125, title: "Visitor", desc: ["Recruiter, hiring", "manager or peer"] },
      { id: "system", kind: "core", x: 370, y: 250, w: 260, h: 120, title: "RAGPortfolio", tech: "[Software system]", desc: ["Portfolio site and RAG chat", "grounded in Toby's study notes"] },
      { id: "drive", kind: "external", x: 30, y: 255, w: 210, h: 110, title: "Google Drive / Docs", tech: "[External]", desc: ["Source study notes"] },
      { id: "zilliz", kind: "db", x: 770, y: 250, w: 190, h: 120, title: "Zilliz Cloud", tech: "[Vector database]", desc: ["Chunk embeddings"] },
      { id: "openai", kind: "external", x: 150, y: 450, w: 220, h: 100, title: "OpenAI", tech: "[gpt-4o-mini]", desc: ["Visitor answers"] },
      { id: "gemini", kind: "external", x: 630, y: 450, w: 220, h: 100, title: "Google Gemini", tech: "[Flash · Flash Lite]", desc: ["Parsing, OCR, tagging,", "planning chat"] },
    ],
    edges: [
      { from: "owner", to: "drive", label: "Writes notes" },
      { from: "owner", to: "system", label: `Curates notes & skills${NL}[HTTPS]` },
      { from: "visitor", to: "system", label: `Browses, asks questions${NL}[HTTPS]` },
      { from: "system", to: "drive", label: `Reads docs${NL}[Drive API]` },
      { from: "system", to: "zilliz", label: `Upserts / searches${NL}[PyMilvus]` },
      { from: "system", to: "openai", label: `Answers${NL}[OpenAI API]` },
      { from: "system", to: "gemini", label: `Parse, tag, plan${NL}[Gemini API]` },
    ],
  },

  c2: {
    width: 1000, height: 790, title: "C2 containers: RAGPortfolio",
    boundaries: [
      { x: 232, y: 150, w: 536, h: 620, label: "RAGPortfolio [software system]" },
      { x: 255, y: 305, w: 490, h: 440, label: "OCI VM · docker-compose.prod.yml" },
    ],
    nodes: [
      { id: "owner", kind: "person", x: 140, y: 12, w: 140, h: 118, title: "Owner (Toby)" },
      { id: "visitor", kind: "person", x: 720, y: 12, w: 140, h: 118, title: "Visitor" },
      { id: "frontend", kind: "core", x: 390, y: 175, w: 220, h: 100, title: "Frontend", tech: "[Vercel · Next.js 14]", desc: ["ISR pages, chat UI,", "/api proxy, /revalidate"] },
      { id: "caddy", kind: "core", x: 390, y: 330, w: 220, h: 85, title: "Caddy", tech: "[Reverse proxy]", desc: ["HTTPS, auto certificates"] },
      { id: "backend", kind: "core", x: 390, y: 455, w: 220, h: 105, title: "Backend API", tech: "[FastAPI · Python 3.11]", desc: ["RAG pipeline, ingestion,", "admin, daily delta sync"] },
      { id: "postgres", kind: "db", x: 275, y: 615, w: 185, h: 105, title: "PostgreSQL 17", tech: "[pgvector image]", desc: ["Notes, skills, visitors,", "query log"] },
      { id: "redis", kind: "db", x: 540, y: 615, w: 185, h: 105, title: "Redis 7", tech: "[In-memory store]", desc: ["Answer cache, sessions,", "rate limits"] },
      { id: "drive", kind: "external", x: 20, y: 455, w: 190, h: 100, title: "Google Drive / Docs", tech: "[External]", desc: ["Source notes"] },
      { id: "zilliz", kind: "db", x: 795, y: 315, w: 185, h: 105, title: "Zilliz Cloud", tech: "[Vector database]", desc: ["Chunk embeddings"] },
      { id: "openai", kind: "external", x: 795, y: 460, w: 185, h: 90, title: "OpenAI", tech: "[gpt-4o-mini]", desc: ["Visitor answers"] },
      { id: "gemini", kind: "external", x: 795, y: 595, w: 185, h: 90, title: "Google Gemini", tech: "[Flash · Flash Lite]", desc: ["Parse, OCR, tag, plan"] },
    ],
    edges: [
      { from: "owner", to: "frontend", label: `Curates${NL}[HTTPS]` },
      { from: "visitor", to: "frontend", label: `Browses, asks${NL}[HTTPS]` },
      { from: "owner", to: "drive", label: "Writes notes" },
      { from: "frontend", to: "caddy", label: "/api/* proxy [HTTPS]" },
      { from: "caddy", to: "backend", label: "[HTTP :8000]" },
      { from: "backend", to: "postgres", label: "[asyncpg]" },
      { from: "backend", to: "redis", label: "[TCP 6379]" },
      { from: "backend", to: "drive", label: "[Drive API]" },
      { from: "backend", to: "zilliz", label: "[PyMilvus]" },
      { from: "backend", to: "openai", label: "[OpenAI API]" },
      { from: "backend", to: "gemini", label: "[Gemini API]" },
      { from: "backend", to: "frontend", label: `On change:${NL}/revalidate`, via: [[665, 478], [665, 236]] },
    ],
  },

  c3: {
    width: 1140, height: 780, title: "C3 components: Backend API",
    boundaries: [{ x: 20, y: 122, w: 1100, h: 465, label: "Backend API [FastAPI container]" }],
    nodes: [
      { id: "frontend", kind: "core", x: 460, y: 12, w: 220, h: 80, title: "Frontend", tech: "[Next.js on Vercel]", desc: ["Calls /api/* via proxy"] },
      { id: "query", kind: "api", x: 40, y: 145, w: 220, h: 95, title: "query.py", tech: "[API routes]", desc: ["/query/stream, /onboard,", "/visitor, /feedback"] },
      { id: "planning", kind: "api", x: 320, y: 145, w: 220, h: 95, title: "planning.py", tech: "[API routes · admin]", desc: ["Owner planning chat", "(Gemini 2.5 Flash)"] },
      { id: "portfolio", kind: "api", x: 600, y: 145, w: 220, h: 95, title: "portfolio.py", tech: "[API routes]", desc: ["/portfolio, /skills,", "/stats/public, /resume"] },
      { id: "admin", kind: "api", x: 880, y: 145, w: 220, h: 95, title: "admin.py", tech: "[API routes · admin]", desc: ["Curation, batch ingest,", "sync, resume upload"] },
      { id: "pipeline", kind: "component", x: 40, y: 300, w: 220, h: 95, title: "pipeline.py", tech: "[RAG orchestration]", desc: ["Cache, retrieve, prompt,", "stream the answer"] },
      { id: "rag", kind: "component", x: 320, y: 300, w: 500, h: 95, title: "rag/ embedder · chunker · retriever", tech: "[Retrieval]", desc: ["MiniLM-L6 embeddings (384-d), heading-aware 256-token chunks,", "Zilliz ANN search and per-doc upsert"] },
      { id: "ingestion", kind: "sync", x: 880, y: 300, w: 220, h: 95, title: "ingestion.py", tech: "[Ingestion]", desc: ["Parse, OCR, tag;", "daily delta sync loop"] },
      { id: "cache", kind: "core", x: 40, y: 460, w: 220, h: 95, title: "cache/", tech: "[Redis client]", desc: ["Answer cache, sessions,", "rate limiter"] },
      { id: "db", kind: "core", x: 320, y: 460, w: 220, h: 95, title: "db/", tech: "[SQLAlchemy · asyncpg]", desc: ["Models, migrations,", "shared queries"] },
      { id: "revalidate", kind: "core", x: 600, y: 460, w: 220, h: 95, title: "revalidate.py", tech: "[ISR hook]", desc: ["Clears stats cache, POSTs", "frontend /revalidate"] },
      { id: "google", kind: "sync", x: 880, y: 460, w: 220, h: 95, title: "google_client.py", tech: "[Drive client]", desc: ["Lists and exports", "Notes_ docs"] },
      { id: "redis", kind: "db", x: 85, y: 660, w: 130, h: 100, title: "Redis 7" },
      { id: "openai", kind: "external", x: 225, y: 665, w: 130, h: 90, title: "OpenAI", tech: "[gpt-4o-mini]" },
      { id: "postgres", kind: "db", x: 365, y: 660, w: 130, h: 100, title: "PostgreSQL 17" },
      { id: "zilliz", kind: "db", x: 505, y: 660, w: 130, h: 100, title: "Zilliz Cloud" },
      { id: "gemini", kind: "external", x: 785, y: 665, w: 130, h: 90, title: "Gemini", tech: "[Flash · Lite]" },
      { id: "drive", kind: "external", x: 925, y: 665, w: 130, h: 90, title: "Google Drive", tech: "[Drive API]" },
    ],
    edges: [
      { from: "frontend", to: "query", label: "JSON / HTTPS" },
      { from: "frontend", to: "planning" },
      { from: "frontend", to: "portfolio" },
      { from: "frontend", to: "admin" },
      { from: "query", to: "pipeline", label: "Answer question" },
      { from: "pipeline", to: "cache", label: "Cache lookup" },
      { from: "pipeline", to: "rag", label: `Embed,${NL}top-k`, at: [290, 347] },
      { from: "pipeline", to: "openai", label: `Stream${NL}answer`, via: [[290, 412]], at: [290, 625] },
      { from: "planning", to: "rag", label: "Retrieve context" },
      { from: "admin", to: "ingestion", label: "Batch / sync" },
      { from: "ingestion", to: "rag", label: `Chunk,${NL}embed,${NL}upsert`, at: [850, 347] },
      { from: "ingestion", to: "google", label: "Export docs" },
      { from: "ingestion", to: "revalidate", label: "After changes" },
      { from: "ingestion", to: "gemini", label: `Parse,${NL}OCR, tag`, via: [[850, 412]], at: [850, 625] },
      { from: "rag", to: "zilliz", label: `ANN search${NL}/ upsert`, at: [570, 625] },
      { from: "cache", to: "redis", label: "[TCP 6379]" },
      { from: "db", to: "postgres", label: "[asyncpg]" },
      { from: "google", to: "drive", label: "Export" },
    ],
  },
};

type Pt = [number, number];

function centre(n: Node): Pt {
  return [n.x + n.w / 2, n.y + n.h / 2];
}

/** Where the line from n's centre towards p leaves n's bounding box. */
function exit(n: Node, p: Pt): Pt {
  const [cx, cy] = centre(n);
  const dx = p[0] - cx, dy = p[1] - cy;
  const t = Math.min(dx ? n.w / 2 / Math.abs(dx) : Infinity, dy ? n.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

function Shape({ n }: { n: Node }) {
  const [fill, stroke] = FILL[n.kind];
  const lines = [
    { text: n.title, cls: "t", gap: 18 },
    ...(n.tech ? [{ text: n.tech, cls: "s", gap: 15 }] : []),
    ...(n.desc ?? []).map((text, i) => ({ text, cls: "d", gap: i === 0 ? 19 : 15 })),
  ];
  const head = n.kind === "person" ? 34 : 0;
  const top = n.kind === "db" ? 12 : 0;
  const textH = lines.reduce((s, l) => s + l.gap, 0);
  let y = n.y + head + top + (n.h - head - top - textH) / 2 + 12;

  let body: React.ReactNode;
  if (n.kind === "person") {
    body = (
      <>
        <circle cx={n.x + n.w / 2} cy={n.y + 18} r={18} fill={fill} />
        <rect x={n.x} y={n.y + 34} width={n.w} height={n.h - 34} rx={18} fill={fill} />
      </>
    );
  } else if (n.kind === "db") {
    const ry = 12;
    body = (
      <>
        <path d={`M${n.x},${n.y + ry} a${n.w / 2},${ry} 0 0 1 ${n.w},0 v${n.h - 2 * ry} a${n.w / 2},${ry} 0 0 1 ${-n.w},0 z`} fill={fill} stroke={stroke} strokeWidth={1.4} />
        <path d={`M${n.x},${n.y + ry} a${n.w / 2},${ry} 0 0 0 ${n.w},0`} fill="none" stroke={stroke} strokeWidth={1.4} />
      </>
    );
  } else {
    body = <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.4} />;
  }

  return (
    <g className={n.kind === "person" ? "person" : undefined}>
      {body}
      {lines.map((l, i) => {
        if (i > 0) y += l.gap;
        return <text key={i} x={n.x + n.w / 2} y={y} textAnchor="middle" className={l.cls}>{l.text}</text>;
      })}
    </g>
  );
}

function route(e: Edge, nodes: Record<string, Node>): Pt[] {
  const a = nodes[e.from], b = nodes[e.to];
  const via = e.via ?? [];
  return [exit(a, via[0] ?? centre(b)), ...via, exit(b, via[via.length - 1] ?? centre(a))];
}

function EdgeLabel({ e, pts }: { e: Edge; pts: Pt[] }) {
  if (!e.label) return null;
  let at = e.at;
  if (!at) {
    let best = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) >
          Math.hypot(pts[best + 1][0] - pts[best][0], pts[best + 1][1] - pts[best][1])) best = i;
    }
    at = [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2];
  }
  const [mx, my] = at;
  const rows = e.label.split(NL);
  const w = Math.max(...rows.map(r => r.length)) * 5.8 + 10;
  const h = rows.length * 13 + 6;
  return (
    <g>
      <rect x={mx - w / 2} y={my - h / 2} width={w} height={h} rx={4} className="edge-label-bg" />
      {rows.map((r, i) => (
        <text key={i} x={mx} y={my - h / 2 + 14 + i * 13} textAnchor="middle" className="edge-label">{r}</text>
      ))}
    </g>
  );
}

export default function C4Diagram({ level }: { level: C4Level }) {
  const d = DIAGRAMS[level];
  const byId = Object.fromEntries(d.nodes.map(n => [n.id, n]));
  const routes = d.edges.map(e => route(e, byId));
  const titleId = `c4-${level}-title`;

  return (
    <svg viewBox={`0 0 ${d.width} ${d.height}`} className="c4" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{d.title}</title>
      <desc>
        {d.edges.map(e => `${byId[e.from].title} → ${byId[e.to].title}${e.label ? `: ${e.label.split(NL).join(" ")}` : ""}`).join(". ")}
      </desc>
      <defs>
        <marker id="c4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--c4-edge)" />
        </marker>
      </defs>
      {d.boundaries?.map(b => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} className="boundary" />
          <text x={b.x + 12} y={b.y + b.h - 12} className="boundary-label">{b.label}</text>
        </g>
      ))}
      {routes.map((pts, i) => (
        <polyline key={i} points={pts.map(p => p.join(",")).join(" ")} className="edge" markerEnd="url(#c4-arrow)" />
      ))}
      {d.nodes.map(n => <Shape key={n.id} n={n} />)}
      {d.edges.map((e, i) => <EdgeLabel key={i} e={e} pts={routes[i]} />)}
    </svg>
  );
}
