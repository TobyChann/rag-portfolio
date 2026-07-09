"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface DocRow {
  id: string;
  google_doc_id: string;
  title: string;
  chunk_count: number;
  summary: string;
  skills: string[];
  tag_status: string;         // pending | approved
  needs_review: boolean;
  last_synced_at: string | null;
}

export default function DocReview() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Draft state for the open doc (modify-before-insert)
  const [draftSummary, setDraftSummary] = useState("");
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [addToInventory, setAddToInventory] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/documents`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setDocs(await res.json());
    } catch {
      setError("Couldn't load documents.");
    } finally {
      setLoading(false);
    }
  }

  function openDoc(d: DocRow) {
    if (openId === d.google_doc_id) { setOpenId(null); return; }
    setOpenId(d.google_doc_id);
    setDraftSummary(d.summary);
    setDraftSkills(d.skills);
    setNewSkill("");
    setError("");
  }

  async function generate(d: DocRow) {
    setGenerating(true); setError("");
    try {
      const res = await fetch(`${API}/admin/documents/${d.google_doc_id}/generate-tags`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const { summary, skills } = await res.json();
      // Fill the drafts only — nothing is saved until you approve
      setDraftSummary(summary);
      setDraftSkills(skills);
    } catch {
      setError("Generation failed — try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function approve(d: DocRow) {
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API}/admin/documents/${d.google_doc_id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          summary: draftSummary,
          skills: draftSkills,
          add_to_inventory: addToInventory,
        }),
      });
      if (!res.ok) throw new Error();
      const { doc } = await res.json();
      setDocs(list => list.map(x => x.google_doc_id === doc.google_doc_id ? doc : x));
      setOpenId(null);
    } catch {
      setError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading documents…</p>;

  const reviewCount = docs.filter(d => d.needs_review || d.tag_status === "pending").length;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          Note tags & summaries
          {reviewCount > 0 && (
            <span className="tag tag-gray" style={{ marginLeft: 8 }}>{reviewCount} to review</span>
          )}
        </p>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          New notes are tagged automatically on first ingest. When a note changes on Drive
          it's flagged here — generate fresh suggestions, edit them, then approve.
          Approving can push new skills into your inventory pool.
        </p>
      </div>

      {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
      {docs.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic" }}>
          No documents ingested yet.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map(d => {
          const open = openId === d.google_doc_id;
          return (
            <div key={d.google_doc_id} style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              background: "var(--bg-secondary)", overflow: "hidden",
            }}>
              <button
                onClick={() => openDoc(d)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "12px 16px", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.title}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {d.needs_review && <span className="tag tag-gray">changed — review</span>}
                  <span className={`tag ${d.tag_status === "approved" ? "tag-green" : "tag-gray"}`}>
                    {d.tag_status}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{open ? "▴" : "▾"}</span>
                </span>
              </button>

              {open && (
                <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Summary */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>
                        Summary
                      </p>
                      <button
                        onClick={() => generate(d)}
                        disabled={generating}
                        className="btn btn-ghost"
                        style={{ fontSize: 12, opacity: generating ? 0.5 : 1 }}
                      >
                        {generating ? "Generating…" : "✨ Generate suggestions"}
                      </button>
                    </div>
                    <textarea
                      value={draftSummary}
                      onChange={e => setDraftSummary(e.target.value)}
                      rows={3}
                      placeholder="What these notes cover and the skills they demonstrate…"
                      style={{
                        width: "100%", fontSize: 13, padding: "8px 12px", lineHeight: 1.6,
                        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                        background: "var(--bg)", color: "var(--fg)", outline: "none",
                        resize: "vertical", fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Skills */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginBottom: 6 }}>
                      Skills
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {draftSkills.map(s => (
                        <span key={s} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 20,
                          border: "1px solid var(--border)", background: "var(--bg)",
                        }}>
                          {s}
                          <button
                            onClick={() => setDraftSkills(list => list.filter(x => x !== s))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={newSkill}
                        onChange={e => setNewSkill(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newSkill.trim()) {
                            if (!draftSkills.includes(newSkill.trim())) {
                              setDraftSkills(list => [...list, newSkill.trim()]);
                            }
                            setNewSkill("");
                          }
                        }}
                        placeholder="Add skill…"
                        style={{
                          flex: 1, fontSize: 12, padding: "6px 10px",
                          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                          background: "var(--bg)", color: "var(--fg)", outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Approve row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={addToInventory}
                        onChange={e => setAddToInventory(e.target.checked)}
                      />
                      Add new skills to my inventory pool
                    </label>
                    <button
                      onClick={() => approve(d)}
                      disabled={saving}
                      className="btn btn-primary"
                      style={{ fontSize: 12, opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? "Saving…" : "Save & approve"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}