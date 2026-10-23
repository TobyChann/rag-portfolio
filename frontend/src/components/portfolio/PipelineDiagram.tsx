"use client";
import { useState } from "react";

export interface Stage {
  id: string;
  label: string;
  sublabel: string;
  skills: string[];
}

export interface PipelineBar {
  label: string;
  items: string[];
}

export const STAGES: Omit<Stage, "skills">[] = [
  { id: "extract",   label: "Extract",   sublabel: "Collection" },
  { id: "load",      label: "Load",      sublabel: "Ingestion" },
  { id: "transform", label: "Transform", sublabel: "Processing" },
  { id: "frontend",  label: "Frontend",  sublabel: "Visualise" },
  { id: "insights",  label: "Insights",  sublabel: "Analytics" },
];

export const BARS = {
  top_bar:    "Delivery & Project Management",
  db_layer:   "Database Layer",
  bottom_bar: "Infrastructure & Backend",
} as const;

const ICONS: Record<string, React.ReactNode> = {
  extract:   <><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
  load:      <><path d="M4 12h14"/><path d="M13 6l6 6-6 6"/></>,
  transform: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,
  frontend:  <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M8 21h8"/></>,
  insights:  <><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
};

const DOMAIN = ["Finance", "Accounting", "Business Analytics"];
const TOP_N = 3;

export default function PipelineDiagram({ stages, bars }: {
  stages: Stage[];
  bars: Record<keyof typeof BARS, string[]>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const activeStage = stages.find(s => s.id === active);
  const stageVars = (id: string) => ({ "--stage": `var(--stage-${id})`, "--stage-bg": `var(--stage-${id}-bg)` }) as React.CSSProperties;

  const bar = (key: keyof typeof BARS, tagClass: string) => (
    <div className="pipeline-bar">
      <span>{BARS[key]}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
        {bars[key].map(item => <span key={item} className={`tag ${tagClass}`} style={{ fontSize: 10.5 }}>{item}</span>)}
      </div>
    </div>
  );

  return (
    <div className="pipeline">
      <div className="pipeline-domain" aria-hidden="true">
        {DOMAIN.map((d, i) => (
          <span key={d}>{d}{i < DOMAIN.length - 1 && <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>}</span>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {bar("top_bar", "tag-gray")}

        <div className="pipeline-stages">
          <div className="pipeline-track" aria-hidden="true"><div className="pipeline-dot" /></div>
          {stages.map(stage => {
            const isActive = active === stage.id;
            const top = stage.skills.slice(0, TOP_N);
            const more = stage.skills.length - top.length;
            return (
              <button
                key={stage.id}
                className="pipeline-stage"
                style={stageVars(stage.id)}
                aria-expanded={isActive}
                aria-controls="pipeline-detail"
                onClick={() => setActive(isActive ? null : stage.id)}
              >
                <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[stage.id]}
                </svg>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{stage.label}</span>
                  <span style={{ display: "block", fontSize: 10, color: "var(--fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stage.sublabel}</span>
                </span>
                {top.length > 0 && (
                  <span className="top-skills">
                    {top.map(s => <span key={s}>{s}</span>)}
                    {more > 0 && <span>+{more}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div id="pipeline-detail" style={{ maxHeight: active ? 240 : 0, overflow: "hidden", transition: "max-height .25s ease-out", marginBottom: active ? 6 : 0 }}>
          {activeStage && (
            <div style={{ ...stageVars(activeStage.id), border: "1px solid var(--stage)", borderRadius: "var(--radius-md)", padding: "12px 16px", background: "var(--stage-bg)" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {activeStage.label} — tools and skills
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeStage.skills.length > 0 ? activeStage.skills.map(s => (
                  <span key={s} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)", fontWeight: 500 }}>{s}</span>
                )) : (
                  <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>No skills curated for this stage yet.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {bar("db_layer", "tag-blue")}
        {bar("bottom_bar", "tag-teal")}
      </div>
    </div>
  );
}
