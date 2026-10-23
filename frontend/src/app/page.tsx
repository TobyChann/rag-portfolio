// frontend/src/app/page.tsx
import { API_BASE, serverFetch } from "@/lib/api";
import { PROFILE, EDUCATION } from "@/lib/profile";
import AskBox from "@/components/portfolio/AskBox";
import HomeSections from "@/components/portfolio/HomeSections";
import type { Portfolio } from "@/components/portfolio/ModulesSection";

export const revalidate = 300;

interface PublicStats {
  modules: number;
  notes: number;
  skills_evidenced: number;
  last_synced_at: string | null;
}

function ago(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function HomePage() {
  const [skills, portfolio, stats, resume] = await Promise.all([
    serverFetch<Record<string, string[]>>("/skills", {}),
    serverFetch<Portfolio>("/portfolio", { folders: [], docs: [] }),
    serverFetch<PublicStats | null>("/stats/public", null),
    serverFetch<{ exists: boolean }>("/resume/meta", { exists: false }),
  ]);

  const proof = [
    { num: EDUCATION.gpa.split(" ")[0], lbl: "cGPA / 4.00" },
    { num: stats?.modules ?? "—", lbl: "modules taken" },
    { num: stats?.notes ?? "—", lbl: "notes indexed" },
    { num: stats?.skills_evidenced ?? "—", lbl: "skills evidenced" },
    { num: ago(stats?.last_synced_at ?? null), lbl: "notes last synced" },
  ];

  const education = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{EDUCATION.school}</p>
          <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {[EDUCATION.degree, EDUCATION.double, EDUCATION.period].join(" · ")}
          </p>
        </div>
        <span className="tag tag-amber">cGPA {EDUCATION.gpa}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 28 }}>
        {EDUCATION.awards.map(a => <span key={a} className="tag tag-gray" style={{ fontSize: 11 }}>{a}</span>)}
      </div>
    </>
  );

  return (
    <main className="page">
      <section className="hero" aria-labelledby="hero-name">
        <h1 id="hero-name">{PROFILE.name}</h1>
        <p style={{ fontSize: 16, color: "var(--fg-muted)", marginTop: 6 }}>{PROFILE.tagline}</p>
        <p style={{ fontSize: 15, color: "var(--fg-muted)", lineHeight: 1.7, marginTop: 12, maxWidth: 620 }}>{PROFILE.pitch}</p>
        <AskBox />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {resume.exists && (
            <a href={`${API_BASE}/resume`} className="btn btn-secondary" style={{ fontSize: 13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
              </svg>
              Download resume
            </a>
          )}
          <a href={PROFILE.github} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/>
            </svg>
            GitHub
          </a>
        </div>
      </section>

      <div className="proof-strip" role="list" aria-label="At a glance">
        {proof.map(p => (
          <div key={p.lbl} role="listitem">
            <div className="num mono">{p.num}</div>
            <div className="lbl">{p.lbl}</div>
          </div>
        ))}
      </div>

      <HomeSections skills={skills} portfolio={portfolio} education={education} />
    </main>
  );
}
