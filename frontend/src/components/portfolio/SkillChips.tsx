"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { openChat } from "@/lib/api";
import { STAGES, BARS } from "@/components/portfolio/PipelineDiagram";
import type { SkillEvidence } from "@/types";

const GROUPS: { id: string; label: string }[] = [
  ...STAGES.map(s => ({ id: s.id, label: `${s.label} · ${s.sublabel}` })),
  { id: "db_layer", label: BARS.db_layer },
  { id: "bottom_bar", label: BARS.bottom_bar },
  { id: "top_bar", label: BARS.top_bar },
];

export default function SkillChips({ skills }: { skills: SkillEvidence[] }) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".skill-pop, .skill-chip")) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [open]);

  const groups = GROUPS.map(g => ({ ...g, skills: skills.filter(s => s.category === g.id) })).filter(g => g.skills.length);
  if (!groups.length) return null;

  return (
    <div className="skill-groups">
      {groups.map(g => (
        <div key={g.id} className="skill-group">
          <p className="skill-group-label">{g.label}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.skills.map(s => {
              const isOpen = open === s.name;
              const id = `skill-pop-${s.name.replace(/\W+/g, "-")}`;
              return (
                <span key={s.name} style={{ position: "relative" }}>
                  <button className="skill-chip" aria-expanded={isOpen} aria-controls={id}
                          onClick={() => setOpen(isOpen ? null : s.name)}>
                    {s.name}
                    {s.count > 0 && <span className="skill-count mono" aria-label={`${s.count} notes`}>{s.count}</span>}
                  </button>
                  {isOpen && (
                    <div id={id} className="skill-pop fade-in" role="dialog" aria-label={`Evidence for ${s.name}`}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{s.name}</p>
                      {s.docs.length > 0 ? (
                        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                          {s.docs.map(d => (
                            <li key={d.google_doc_id}>
                              <Link href={`/notes/${d.google_doc_id}`} className="skill-pop-link">
                                <span>{d.module || d.display_name}</span>
                                {d.grade && <span className="tag tag-amber" style={{ fontSize: 10, padding: "1px 7px" }}>{d.grade}</span>}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Not linked to a note yet.</p>
                      )}
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 8px", marginTop: 8 }}
                              onClick={() => { setOpen(null); openChat(`What has Toby done with ${s.name}?`); }}>
                        Ask about {s.name} →
                      </button>
                    </div>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
