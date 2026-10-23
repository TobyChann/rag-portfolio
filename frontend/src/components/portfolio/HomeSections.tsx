"use client";
import { useCallback, useEffect, useState } from "react";
import PipelineDiagram, { STAGES, BARS } from "@/components/portfolio/PipelineDiagram";
import ModulesSection, { type Portfolio } from "@/components/portfolio/ModulesSection";
import SkillsBoard from "@/components/admin/SkillsBoard";
import SkillChips from "@/components/portfolio/SkillChips";
import { API_BASE as API } from "@/lib/api";
import type { SkillEvidence } from "@/types";

// The server renders these with the public data; for the owner, the same
// components hydrate and switch into Curate mode.
export default function HomeSections({ skills: initialSkills, evidence, portfolio, education }: {
  skills: Record<string, string[]>;
  evidence: SkillEvidence[];
  portfolio: Portfolio;
  education: React.ReactNode;
}) {
  const [skills, setSkills] = useState(initialSkills);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : { authenticated: false }))
      .then(d => setIsAdmin(!!d.authenticated))
      .catch(() => {});
  }, []);

  const reloadSkills = useCallback(async () => {
    const res = await fetch(`${API}/skills`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSkills(await res.json());
  }, []);

  const stages = STAGES.map(s => ({ ...s, skills: skills[s.id] ?? [] }));
  const bars = Object.fromEntries(
    (Object.keys(BARS) as (keyof typeof BARS)[]).map(k => [k, skills[k] ?? []])) as Record<keyof typeof BARS, string[]>;

  return (
    <>
      {isAdmin && (
        <div style={{ position: "fixed", top: 72, right: 16, zIndex: 40 }}>
          <button onClick={() => setEditMode(e => !e)} aria-pressed={editMode} style={{
            height: 34, borderRadius: 17, padding: "0 14px", fontFamily: "inherit",
            background: editMode ? "var(--fg)" : "var(--bg)",
            color: editMode ? "var(--bg)" : "var(--fg-muted)",
            border: editMode ? "1px solid var(--fg)" : "1px solid var(--border-strong)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
            boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {editMode
                ? <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>
                : <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
            </svg>
            {editMode ? "Done curating" : "Curate"}
          </button>
        </div>
      )}

      <section style={{ marginBottom: 48 }} aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="section-label" style={{ marginBottom: 20 }}>Skills pipeline</h2>
        <PipelineDiagram stages={stages} bars={bars} />
        <SkillChips skills={evidence} />
        <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 12 }}>
          The number on a skill is how many of Toby&apos;s notes evidence it. Select one to see them.
        </p>
        {editMode && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
                Skill inventory (drag to publish)
              </p>
              <button onClick={reloadSkills} className="btn btn-ghost" style={{ fontSize: 12 }}>↻ Refresh diagram</button>
            </div>
            <SkillsBoard />
          </div>
        )}
      </section>

      <section style={{ marginBottom: 48 }} aria-labelledby="modules-heading">
        {education}
        <h2 id="modules-heading" className="section-label">
          Academic modules
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8 }}>
            · select a note to open
          </span>
        </h2>
        <ModulesSection initial={portfolio} editMode={editMode} />
      </section>
    </>
  );
}
