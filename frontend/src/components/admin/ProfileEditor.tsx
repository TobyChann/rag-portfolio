"use client";
import { useState, useEffect } from "react";

import { API_BASE as API } from "@/lib/api";

interface ProfileNote {
  id: string;
  category: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

const NOTE_CATEGORIES = ["goal", "education", "background", "preference", "misc"] as const;

export default function ProfileEditor() {
  const [notes, setNotes] = useState<ProfileNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState<string>("goal");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/profile-notes`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setNotes(await res.json());
    } catch {
      setError("Couldn't load profile notes.");
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    const content = newContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`${API}/admin/profile-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category: newCat, content }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setNotes(n => [...n, created]);
      setNewContent("");
    } catch {
      setError("Couldn't add note.");
    }
  }

  async function saveEdit(id: string) {
    const content = editText.trim();
    if (!content) return;
    try {
      const res = await fetch(`${API}/admin/profile-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setNotes(n => n.map(x => x.id === id ? updated : x));
      setEditingId(null);
    } catch {
      setError("Couldn't save the edit.");
    }
  }

  async function removeNote(id: string) {
    const prev = notes;
    setNotes(n => n.filter(x => x.id !== id));
    try {
      const res = await fetch(`${API}/admin/profile-notes/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error();
    } catch {
      setNotes(prev);
    }
  }

  async function copyProfile() {
    try {
      const res = await fetch(`${API}/planning/export`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const { text } = await res.json();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the profile.");
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading profile…</p>;

  const grouped = NOTE_CATEGORIES
    .map(cat => ({ cat, items: notes.filter(n => n.category === cat) }))
    .filter(g => g.items.length > 0);
  // Anything with a category outside the known list still shows
  const other = notes.filter(n => !NOTE_CATEGORIES.includes(n.category as any));

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Profile</p>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7, maxWidth: 480 }}>
            One line per fact — your goal, education, background, preferences.
            The planning chat reads this on every message; it's how the assistant knows you.
          </p>
        </div>
        <button onClick={copyProfile} className="btn btn-ghost" style={{ fontSize: 12 }}>
          {copied ? "Copied ✓" : "Copy profile as prompt"}
        </button>
      </div>

      {/* Add note */}
      <div style={{
        padding: "14px 16px", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", background: "var(--bg-secondary)",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NOTE_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setNewCat(c)}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${newCat === c ? "var(--accent)" : "var(--border)"}`,
                background: newCat === c ? "var(--accent-light)" : "var(--bg)",
                color: newCat === c ? "var(--accent-text)" : "var(--fg-muted)",
                fontWeight: newCat === c ? 600 : 400,
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addNote()}
            placeholder={newCat === "goal" ? "e.g. Quantitative Developer in Singapore by 2027" : "Add a fact about yourself…"}
            style={{
              flex: 1, fontSize: 12, padding: "7px 12px",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              background: "var(--bg)", color: "var(--fg)", outline: "none",
            }}
          />
          <button onClick={addNote} className="btn btn-primary" style={{ fontSize: 12 }}>Add</button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
      {notes.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic" }}>
          Empty. Start with a goal — the planning chat is only as good as this profile.
        </p>
      )}

      {/* Grouped notes */}
      {[...grouped, ...(other.length ? [{ cat: "other", items: other }] : [])].map(g => (
        <div key={g.cat}>
          <p className="section-label" style={{ marginBottom: 8 }}>{g.cat}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {g.items.map((n, i) => (
              <div key={n.id} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                borderBottom: i < g.items.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                {editingId === n.id ? (
                  <>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                      autoFocus
                      style={{
                        flex: 1, fontSize: 13, padding: "7px 10px", lineHeight: 1.6,
                        border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
                        background: "var(--bg)", color: "var(--fg)", outline: "none",
                        resize: "vertical", fontFamily: "inherit",
                      }}
                    />
                    <button onClick={() => saveEdit(n.id)} className="btn btn-primary" style={{ fontSize: 12 }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <p style={{ flex: 1, fontSize: 13, lineHeight: 1.7 }}>{n.content}</p>
                    <button
                      onClick={() => { setEditingId(n.id); setEditText(n.content); }}
                      className="btn btn-ghost" style={{ fontSize: 12 }}
                    >Edit</button>
                    <button
                      onClick={() => removeNote(n.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 15, lineHeight: 1, padding: "4px 2px" }}
                      title="Delete"
                    >×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}