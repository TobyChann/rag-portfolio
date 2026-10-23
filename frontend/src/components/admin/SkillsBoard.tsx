"use client";
import { useState, useEffect } from "react";

import { API_BASE as API } from "@/lib/api";

interface SkillRow {
  id: string;
  name: string;
  category: string | null;
  achieved: boolean;
  sort_order: number;
}

// Canonical categories = the ids the public diagram renders from.
// Stage ids map to PipelineDiagram stages; bar ids map to the three bars.
const CATEGORIES: { id: string; label: string }[] = [
  { id: "extract",    label: "Extract — Collection" },
  { id: "load",       label: "Load — Ingestion" },
  { id: "transform",  label: "Transform — Processing" },
  { id: "frontend",   label: "Frontend — Visualise" },
  { id: "insights",   label: "Insights — Analytics" },
  { id: "top_bar",    label: "Delivery & Project Management" },
  { id: "db_layer",   label: "Database Layer" },
  { id: "bottom_bar", label: "Infrastructure & Backend" },
];

export default function SkillsBoard() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/skills`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setSkills(await res.json());
    } catch {
      setError("Couldn't load skills.");
    } finally {
      setLoading(false);
    }
  }

  async function setCategory(id: string, category: string | null) {
    // Optimistic update, revert on failure
    const prev = skills;
    setSkills(s => s.map(x => x.id === id ? { ...x, category } : x));
    try {
      const res = await fetch(`${API}/admin/skills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category: category ?? "" }),   // "" clears → off-diagram
      });
      if (!res.ok) throw new Error();
    } catch {
      setSkills(prev);
    }
  }

  async function addSkill() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API}/admin/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) { setError(`"${name}" already exists.`); return; }
      if (!res.ok) throw new Error();
      const created = await res.json();
      setSkills(s => [...s, created]);
      setNewName(""); setError("");
    } catch {
      setError("Couldn't add skill.");
    }
  }

  async function removeSkill(id: string) {
    const prev = skills;
    setSkills(s => s.filter(x => x.id !== id));
    try {
      const res = await fetch(`${API}/admin/skills/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error();
    } catch {
      setSkills(prev);
    }
  }

  // Any category values in the data that aren't canonical (e.g. old seeded
  // labels) get their own column so nothing is invisible.
  const extraCats = Array.from(new Set(
    skills.map(s => s.category).filter((c): c is string => !!c && !CATEGORIES.some(k => k.id === c))
  ));
  const allCats = [...CATEGORIES, ...extraCats.map(c => ({ id: c, label: `${c} (legacy)` }))];
  const uncategorised = skills.filter(s => !s.category);

  function chip(s: SkillRow) {
    return (
      <span
        key={s.id}
        draggable
        onDragStart={() => setDragId(s.id)}
        onDragEnd={() => { setDragId(null); setOverCat(null); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 20,
          border: "1px solid var(--border)", background: "var(--bg)",
          cursor: "grab", opacity: dragId === s.id ? 0.4 : 1, userSelect: "none",
        }}
      >
        {s.name}
        <button
          onClick={() => removeSkill(s.id)}
          title="Delete from inventory"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}
        >×</button>
      </span>
    );
  }

  function dropZone(catId: string | null, label: string, items: SkillRow[], hint?: string) {
    const active = overCat === (catId ?? "__none__");
    return (
      <div
        key={catId ?? "__none__"}
        onDragOver={e => { e.preventDefault(); setOverCat(catId ?? "__none__"); }}
        onDragLeave={() => setOverCat(null)}
        onDrop={e => {
          e.preventDefault();
          if (dragId) setCategory(dragId, catId);
          setDragId(null); setOverCat(null);
        }}
        style={{
          padding: "12px 14px",
          border: `1px ${active ? "solid var(--accent)" : "solid var(--border)"}`,
          borderRadius: "var(--radius-md)",
          background: active ? "var(--accent-light)" : "var(--bg-secondary)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginBottom: 8 }}>
          {label} <span style={{ fontWeight: 400 }}>({items.length})</span>
        </p>
        {hint && items.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>{hint}</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map(chip)}
        </div>
      </div>
    );
  }

  if (loading) return <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading skills…</p>;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Skill inventory</p>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          Drag a skill onto a category to publish it on the public diagram.
          Drag it back to the pool to unpublish. Skills auto-added from ingested
          notes land in the pool — nothing shows publicly until you place it.
        </p>
      </div>

      {/* Add + errors */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addSkill()}
          placeholder="Add a skill…"
          style={{
            flex: 1, fontSize: 12, padding: "7px 12px",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            background: "var(--bg)", color: "var(--fg)", outline: "none",
          }}
        />
        <button onClick={addSkill} className="btn btn-primary" style={{ fontSize: 12 }}>Add</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}

      {/* Uncategorised pool */}
      {dropZone(null, "Pool — not on the diagram", uncategorised,
        "Empty. New skills from ingestion appear here.")}

      {/* Category columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {allCats.map(c => dropZone(c.id, c.label, skills.filter(s => s.category === c.id)))}
      </div>
    </div>
  );
}