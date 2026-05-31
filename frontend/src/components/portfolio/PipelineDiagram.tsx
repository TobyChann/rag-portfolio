"use client";
import { useState, useEffect, useRef } from "react";

export interface Stage {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  borderColor: string;
  skills: string[];
}

export interface PipelineBar {
  label: string;
  items: string[];
}

const DEFAULT_TOP_BAR: PipelineBar = {
  label: "Project Management",
  items: ["Scrum / Agile", "Jira", "Git / GitHub", "TDD", "Software Project Management"],
};

const DEFAULT_DB_LAYER: PipelineBar = {
  label: "Database Layer",
  items: ["SQL", "NoSQL", "Vector DB", "PostgreSQL", "Big data concepts", "Data modeling"],
};

const DEFAULT_BOTTOM_BAR: PipelineBar = {
  label: "Infrastructure Design",
  items: ["Docker", "Railway", "Cloud deployment", "C4 architecture", "System design", "REST API design"],
};

const STAGES: Stage[] = [
  {
    id: "extract",
    label: "Extract",
    sublabel: "Collection",
    icon: "⬇",
    color: "#FEF3C7",
    borderColor: "#D4A017",
    skills: ["Google Drive API", "REST APIs", "Web scraping", "Webhooks", "Python requests", "JSON / XML"],
  },
  {
    id: "load",
    label: "Load",
    sublabel: "Ingestion",
    icon: "→",
    color: "#EFF6FF",
    borderColor: "#3B82F6",
    skills: ["PostgreSQL", "NoSQL", "Vector DB (Milvus)", "Supabase", "Big data concepts", "Data warehousing"],
  },
  {
    id: "transform",
    label: "Transform",
    sublabel: "Processing",
    icon: "⚙",
    color: "#F0FDF4",
    borderColor: "#22C55E",
    skills: ["Python", "Pandas", "NumPy", "Power Query", "SQL", "dbt concepts", "Node.js", "FastAPI", "Flask", "Express", "PHP"],
  },
  {
    id: "frontend",
    label: "Frontend",
    sublabel: "Visualise",
    icon: "◻",
    color: "#F5F3FF",
    borderColor: "#8B5CF6",
    skills: ["React", "Vue", "Next.js", "Bootstrap", "Tailwind", "EJS", "HTML / CSS", "Figma", "UI/UX design"],
  },
  {
    id: "insights",
    label: "Insights",
    sublabel: "Analytics",
    icon: "↗",
    color: "#FFF1F2",
    borderColor: "#F43F5E",
    skills: ["Pandas", "NumPy", "Matplotlib", "Statistical modeling", "Financial analytics", "Portfolio optimization", "DCF / valuation", "Power BI / Excel"],
  },
];

const DOMAIN = ["Finance", "Accounting", "Business Analytics"];

export { STAGES as DEFAULT_STAGES };

export default function PipelineDiagram({
  stages: propStages,
  topBar,
  dbLayer,
  bottomBar,
}: {
  stages?: Stage[];
  topBar?: PipelineBar;
  dbLayer?: PipelineBar;
  bottomBar?: PipelineBar;
}) {
  const stages     = propStages || STAGES;
  const topBarData = (topBar?.items?.length ?? 0) > 0 ? topBar! : DEFAULT_TOP_BAR;
  const dbData     = (dbLayer?.items?.length ?? 0) > 0 ? dbLayer! : DEFAULT_DB_LAYER;
  const bottomData = (bottomBar?.items?.length ?? 0) > 0 ? bottomBar! : DEFAULT_BOTTOM_BAR;

  const [active, setActive]     = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [flowPos, setFlowPos]   = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let start: number | null = null;
    const duration = 2800;
    function step(ts: number) {
      if (!start) start = ts;
      const elapsed = (ts - start) % duration;
      setFlowPos(elapsed / duration);
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const activeStage = stages.find(s => s.id === active);

  return (
    <div style={{
      fontFamily: "inherit",
      userSelect: "none",
      opacity: animated ? 1 : 0,
      transform: animated ? "translateY(0)" : "translateY(12px)",
      transition: "opacity .5s ease, transform .5s ease",
    }}>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        {/* Domain label */}
        <div style={{
          writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)",
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--fg-subtle)", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "0 4px", borderLeft: "2px solid var(--accent)", flexShrink: 0,
        }}>
          {DOMAIN.map((d, i) => (
            <span key={d}>{d}{i < DOMAIN.length - 1 && <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>}</span>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top bar */}
          <div style={{ background: "#F8FAFC", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", minWidth: 120 }}>{topBarData.label}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {topBarData.items.map(item => (
                <span key={item} className="tag tag-gray" style={{ fontSize: 10 }}>{item}</span>
              ))}
            </div>
          </div>

          {/* Pipeline stages */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 6, position: "relative", marginBottom: 6 }}>
            <div style={{ position: "absolute", top: "50%", left: "10%", right: "10%", height: 2, background: "var(--border)", zIndex: 0, transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: `calc(10% + ${flowPos * 80}%)`, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", zIndex: 1, transform: "translate(-50%, -50%)", boxShadow: `0 0 6px var(--accent)`, transition: "left 0.05s linear" }} />

            {stages.map((stage, i) => {
              const isActive = active === stage.id;
              return (
                <div key={stage.id} style={{ position: "relative", zIndex: 2 }}>
                  {i < stages.length - 1 && (
                    <div style={{ position: "absolute", right: -10, top: "50%", transform: "translateY(-50%)", zIndex: 3, fontSize: 14, color: "var(--border-strong)", pointerEvents: "none" }}>›</div>
                  )}
                  <button
                    onClick={() => setActive(isActive ? null : stage.id)}
                    style={{
                      width: "100%", padding: "14px 8px",
                      border: `2px solid ${isActive ? stage.borderColor : "var(--border)"}`,
                      borderRadius: "var(--radius-md)",
                      background: isActive ? stage.color : "var(--bg)",
                      cursor: "pointer", textAlign: "center",
                      transition: "all .18s ease",
                      transform: isActive ? "translateY(-3px)" : "translateY(0)",
                      boxShadow: isActive ? `0 4px 12px ${stage.borderColor}30` : "none",
                    }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.borderColor = stage.borderColor; (e.currentTarget as HTMLElement).style.background = stage.color; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--bg)"; } }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6, filter: isActive ? "none" : "grayscale(0.3)" }}>{stage.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", marginBottom: 2 }}>{stage.label}</div>
                    <div style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stage.sublabel}</div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Skill expand panel */}
          <div style={{ maxHeight: active ? 160 : 0, overflow: "hidden", transition: "max-height .25s ease", marginBottom: active ? 6 : 0 }}>
            {activeStage && (
              <div style={{ border: `1px solid ${activeStage.borderColor}`, borderRadius: "var(--radius-md)", padding: "12px 16px", background: activeStage.color }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {activeStage.label} — tools and skills
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {activeStage.skills.map(s => (
                    <span key={s} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "white", border: `1px solid ${activeStage.borderColor}50`, color: "var(--fg)", fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DB layer */}
          <div style={{ background: "#FAFAFA", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", minWidth: 120 }}>{dbData.label}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {dbData.items.map(item => <span key={item} className="tag tag-blue" style={{ fontSize: 10 }}>{item}</span>)}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ background: "#F8FAFC", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", minWidth: 120 }}>{bottomData.label}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {bottomData.items.map(item => <span key={item} className="tag tag-teal" style={{ fontSize: 10 }}>{item}</span>)}
            </div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--fg-subtle)", textAlign: "center", marginTop: 10 }}>
        Click any stage to see tools and skills
      </p>
    </div>
  );
}