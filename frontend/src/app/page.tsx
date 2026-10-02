// frontend/src/app/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import PipelineDiagram, { DEFAULT_STAGES, type Stage } from "@/components/portfolio/PipelineDiagram";
import ModulesSection from "@/components/portfolio/ModulesSection";
import SkillsBoard from "@/components/admin/SkillsBoard";

import { API_BASE as API } from "@/lib/api";

// ─── Content (hardcoded — home_content is gone; edit here) ───  // EDIT ME
const PROFILE = {
  name: "Hi, I'm Toby",
  tagline: "Information Systems & Accountancy @ SMU · aspiring analytics engineer",
  bio: "I build data products end to end — this site is one of them. Everything below is generated from my actual study notes: they're ingested from Google Drive, embedded, and queryable through the chat. Ask it anything about what I know.",
};

const EDUCATION = {
  school: "Singapore Management University",
  degree: "BSc (Information Systems, Business Analytics)",
  double: "Bachelor of Accountancy (double degree)",
  period: "Aug 2023 – Nov 2027",
  gpa: "3.93 / 4.00",               // empty hides the badge
  awards: ["Dean's List AY23/24", "Dean's List AY24/25", "Dean's List AY25/26",
           "SCIS Achievements Scholarship", "Teaching Assistant, IS430 Digital Payments and Innovation"],
};
// ─────────────────────────────────────────────────────────────

interface PipelineBar {
  label: string;
  items: string[];
}

export default function HomePage() {
  const [editMode, setEditMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pipelineStages, setPipelineStages] = useState<Stage[]>(() =>
    DEFAULT_STAGES.map(s => ({ ...s, skills: [] }))
  );
  const [pipelineBars, setPipelineBars] = useState<Record<string, PipelineBar>>({
    top_bar:    { label: "Delivery & Project Management", items: [] },
    db_layer:   { label: "Database Layer", items: [] },
    bottom_bar: { label: "Infrastructure & Backend", items: [] },
  });

  const [hasResume, setHasResume] = useState(false);
  useEffect(() => {
    fetch(`${API}/resume/meta`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setHasResume(!!d?.exists))
      .catch(() => {});
  }, []);

  // Check admin
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  // The diagram renders ONLY from the curated Skill inventory — no more
  // hardcoded placeholder skills. Empty category = empty on the diagram.
  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch(`${API}/skills`);
      const skillsData: Record<string, string[]> = res.ok ? await res.json() : {};
      setPipelineStages(DEFAULT_STAGES.map(s => ({
        ...s,
        skills: skillsData[s.id] ?? [],
      })));
      setPipelineBars(prev => ({
        top_bar:    { ...prev.top_bar,    items: skillsData.top_bar    ?? [] },
        db_layer:   { ...prev.db_layer,   items: skillsData.db_layer   ?? [] },
        bottom_bar: { ...prev.bottom_bar, items: skillsData.bottom_bar ?? [] },
      }));
    } catch { /* leave empty */ }
  }, []);

  useEffect(() => {
    loadSkills().finally(() => setLoading(false));
  }, [loadSkills]);

  if (loading) return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center", color: "var(--fg-muted)", fontSize: 14 }}>
      Loading…
    </main>
  );

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}>

      {/* Admin edit toggle */}
      {isAdmin && (
        <div style={{ position: "fixed", top: 80, right: 24, zIndex: 40 }}>
          <button
            onClick={() => setEditMode(e => !e)}
            style={{
              height: 34, borderRadius: 17, padding: "0 14px",
              background: editMode ? "var(--fg)" : "var(--bg)",
              color: editMode ? "var(--bg)" : "var(--fg-muted)",
              border: editMode ? "1px solid var(--fg)" : "1px solid var(--border-strong)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {editMode
                ? <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>
                : <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              }
            </svg>
            {editMode ? "Done curating" : "Curate"}
          </button>
        </div>
      )}

      {/* ── Intro (hardcoded) ────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{PROFILE.name}</h1>
        <p style={{ fontSize: 16, color: "var(--fg-muted)", marginBottom: 12 }}>{PROFILE.tagline}</p>
        <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8 }}>{PROFILE.bio}</p>
        {hasResume && (
          <a href={`${API}/resume`} className="btn btn-secondary"
             style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, textDecoration: "none" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
            </svg>
            Download resume
          </a>
        )}
      </section>

      {/* ── Skills pipeline ──────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <p className="section-label" style={{ marginBottom: 20 }}>Skills pipeline</p>
        <PipelineDiagram
          stages={pipelineStages}
          topBar={pipelineBars.top_bar}
          dbLayer={pipelineBars.db_layer}
          bottomBar={pipelineBars.bottom_bar}
        />
        {editMode && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
                Skill inventory (drag to publish)
              </p>
              <button onClick={loadSkills} className="btn btn-ghost" style={{ fontSize: 12 }}>
                ↻ Refresh diagram
              </button>
            </div>
            <SkillsBoard />
          </div>
        )}
      </section>

      {/* ── Education ────────────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{EDUCATION.school}</p>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
              {[EDUCATION.degree, EDUCATION.double, EDUCATION.period].filter(Boolean).join(" · ")}
            </p>
          </div>
          {EDUCATION.gpa && <span className="tag tag-amber">cGPA {EDUCATION.gpa}</span>}
        </div>

        {EDUCATION.awards.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 28 }}>
            {EDUCATION.awards.map(a => (
              <span key={a} className="tag tag-gray" style={{ fontSize: 11 }}>{a}</span>
            ))}
          </div>
        )}

        {/* Academic modules — folders + notes from the ingested corpus */}
        <p className="section-label" style={{ marginTop: EDUCATION.awards.length ? 0 : 20 }}>
          Academic modules
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8 }}>
            · click a note to open
          </span>
        </p>
        <ModulesSection editMode={editMode} />
      </section>

    </main>
  );
}