import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api";
import type { NotePage } from "@/types";
import NoteActions from "@/components/notes/NoteActions";

export const revalidate = 300;

const load = (docId: string) => serverFetch<NotePage | null>(`/notes/${encodeURIComponent(docId)}`, null);

const cleanHeading = (h: string) =>
  h.replace(/^#+\s*/, "").replace(/<[^>]+>/g, "").replace(/\$[^$]*\$/g, "→").replace(/[*_`]/g, "").trim();

function titleOf(n: NotePage) {
  return n.module_path[n.module_path.length - 1] ?? n.display_name;
}

export async function generateMetadata({ params }: { params: { docId: string } }): Promise<Metadata> {
  const n = await load(params.docId);
  if (!n) return { title: "Note not found" };
  return {
    title: `${titleOf(n)} notes`,
    description: n.summary.slice(0, 200) || `Toby Chan's study notes for ${titleOf(n)}.`,
  };
}

export default async function NotePageView({ params }: { params: { docId: string } }) {
  const n = await load(params.docId);
  if (!n) notFound();
  const synced = n.last_synced_at
    ? new Date(n.last_synced_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <main className="page">
      <nav aria-label="Breadcrumb" style={{ fontSize: 12.5, color: "var(--fg-subtle)", marginBottom: 10 }}>
        <Link href="/" style={{ color: "inherit" }}>Home</Link>
        {n.module_path.map(p => <span key={p}> / {p}</span>)}
      </nav>
      <p className="section-label" style={{ marginBottom: 4 }}>Study notes · {n.display_name}</p>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{titleOf(n)}</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "10px 0 18px" }}>
        {n.grade && <span className="tag tag-amber">Grade {n.grade}</span>}
        {synced && <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Notes last synced {synced}</span>}
      </div>

      {n.summary && <p style={{ fontSize: 15.5, lineHeight: 1.75, maxWidth: 680 }}>{n.summary}</p>}

      {n.skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 16 }}>
          {n.skills.map(s => <span key={s} className="tag tag-blue">{s}</span>)}
        </div>
      )}

      <NoteActions docId={n.google_doc_id} title={titleOf(n)} />

      <section aria-labelledby="outline-title" style={{ marginTop: 36 }}>
        <h2 id="outline-title" className="section-label">What the notes cover</h2>
        {n.outline.length > 0 ? (
          <ol className="note-outline">
            {n.outline.map(o => (
              <li key={o.chunk_index} id={`chunk-${o.chunk_index}`} data-index={o.chunk_index}>{cleanHeading(o.heading)}</li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)" }}>These notes aren&apos;t split into sections. Ask the assistant about anything in them.</p>
        )}
        <p style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 12 }}>
          The full text isn&apos;t published here; the assistant answers from it and cites the sections it uses.
        </p>
      </section>

      {n.related.length > 0 && (
        <section aria-labelledby="related-title" style={{ marginTop: 36 }}>
          <h2 id="related-title" className="section-label">Related notes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {n.related.map(r => (
              <Link key={r.google_doc_id} href={`/notes/${r.google_doc_id}`} className="card-link">
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.module || r.display_name}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>{r.display_name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
