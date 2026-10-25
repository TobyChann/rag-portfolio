import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api";
import MatchResults from "@/components/match/MatchResults";
import type { MatchResult } from "@/types";

type Stored = MatchResult & { id: string; created_at: string; jd_excerpt: string };

// Stored results never change, so they can be cached for a long time.
const load = (id: string) =>
  serverFetch<Stored | null>(`/match/${encodeURIComponent(id)}`, null, { next: { revalidate: 86400 } });

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const m = await load(params.id);
  if (!m) return { title: "Job match" };
  const c = m.summary?.counts;
  return {
    title: `${m.role_title ?? "Job match"}${m.company_guess ? ` · ${m.company_guess}` : ""}`,
    description: c ? `My fit: ${c.strong} strong, ${c.partial} partial, ${c.gap} gaps, graded from my notes and resume.` : undefined,
    robots: { index: false },
  };
}

export default async function SavedMatchPage({ params }: { params: { id: string } }) {
  const m = await load(params.id);
  if (!m) notFound();
  const requirements = m.rows.map(({ id, text, kind, must_have }) => ({ id, text, kind, must_have }));

  return (
    <main className="page">
      <p style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 6 }}>
        Saved job match · {new Date(m.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
      </p>
      <MatchResults result={{ ...m, requirements }} pending={false} matchId={m.id} />
      <details style={{ marginTop: 20, fontSize: 13, color: "var(--fg-muted)" }}>
        <summary style={{ cursor: "pointer" }}>Job description (excerpt)</summary>
        <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{m.jd_excerpt}{m.jd_excerpt.length >= 300 ? "…" : ""}</p>
      </details>
      <p className="match-actions" style={{ marginTop: 24 }}>
        <Link href="/match" className="btn btn-secondary">Match another job description</Link>
      </p>
    </main>
  );
}
