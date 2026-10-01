// frontend/src/components/portfolio/ModulesSection.tsx
"use client";
import { useState, useEffect, useCallback } from "react";

import { API_BASE as API } from "@/lib/api";

interface PortfolioDoc {
  id: string;
  google_doc_id: string;
  title: string;
  display_name: string;
  summary: string;
  skills: string[];
  tag_status: string;
  needs_review: boolean;
  parse_status: string;
  course_id: string | null;
  last_synced_at: string | null;
  chunk_count: number;
}

interface PortfolioCourse {
  id: string;
  name: string;
  summary: string;
  is_currently_learning: boolean;
  notes: string;
  grade: string;
  docs: PortfolioDoc[];
}

interface Portfolio {
  courses: PortfolioCourse[];
  loose_docs: PortfolioDoc[];
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--fg)",
  outline: "none", width: "100%",
};

const NOTE_GRID: React.CSSProperties = {
  display: "grid",
  // ~3 across on the (now wider) page, collapsing to 2 then 1 as it narrows.
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 10,
};

// ── date helpers ──────────────────────────────────────────
function fmtSynced(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "Never synced", stale: true };
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return { text: `Synced ${date}, ${time}`, stale: false };
}

export default function ModulesSection({ editMode }: { editMode: boolean }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [modalDoc, setModalDoc] = useState<PortfolioDoc | null>(null);
  const [newCourseName, setNewCourseName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (!res.ok) throw new Error();
      const fresh: Portfolio = await res.json();
      setData(fresh);
      // Keep the open modal in sync with refreshed data (after an edit/save).
      setModalDoc(prev => {
        if (!prev) return null;
        const all = [...fresh.loose_docs, ...fresh.courses.flatMap(c => c.docs)];
        return all.find(d => d.id === prev.id) ?? null;
      });
    } catch {
      setError("Couldn't load modules.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCourse() {
    const name = newCourseName.trim();
    if (!name) return;
    const res = await fetch(`${API}/admin/courses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ name }),
    });
    if (res.ok) { setNewCourseName(""); load(); }
  }

  if (error) return <p style={{ fontSize: 13, color: "#DC2626" }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading modules…</p>;

  const allCourses = data.courses.map(c => ({ id: c.id, name: c.name }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.courses.map(course => (
        <CourseFolder
          key={course.id}
          course={course}
          open={openCourse === course.id}
          onToggle={() => setOpenCourse(openCourse === course.id ? null : course.id)}
          onOpenDoc={setModalDoc}
          editMode={editMode}
          reload={load}
        />
      ))}

      {data.loose_docs.length > 0 && (
        <div>
          {data.courses.length > 0 && (
            <p className="section-label" style={{ margin: "8px 0" }}>Other notes</p>
          )}
          <div style={NOTE_GRID}>
            {data.loose_docs.map(doc => (
              <DocCard key={doc.id} doc={doc} editMode={editMode} onOpen={() => setModalDoc(doc)} />
            ))}
          </div>
        </div>
      )}

      {data.courses.length === 0 && data.loose_docs.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic" }}>
          Nothing ingested yet.
        </p>
      )}

      {editMode && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            value={newCourseName}
            onChange={e => setNewCourseName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createCourse()}
            placeholder="New folder name…"
            style={{ ...inputStyle, maxWidth: 280 }}
          />
          <button onClick={createCourse} className="btn btn-secondary" style={{ fontSize: 12 }}>
            + Add folder
          </button>
        </div>
      )}

      {modalDoc && (
        <DocModal
          doc={modalDoc}
          editMode={editMode}
          allCourses={allCourses}
          onClose={() => setModalDoc(null)}
          reload={load}
        />
      )}
    </div>
  );
}

// ─── Course folder ────────────────────────────────────────

function CourseFolder({
  course, open, onToggle, onOpenDoc, editMode, reload,
}: {
  course: PortfolioCourse;
  open: boolean;
  onToggle: () => void;
  onOpenDoc: (doc: PortfolioDoc) => void;
  editMode: boolean;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: course.name, summary: course.summary,
    is_currently_learning: course.is_currently_learning, notes: course.notes,
    grade: course.grade,
  });
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState("");

  // How many notes in this folder still need attention (for the header badge).
  const unsynced = course.docs.filter(d => !d.last_synced_at).length;

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${API}/admin/courses/${course.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify(draft),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); reload(); } else setErr("Save failed.");
  }

  async function aiSummary() {
    setGenBusy(true); setErr("");
    const res = await fetch(`${API}/admin/courses/${course.id}/generate-summary`, {
      method: "POST", credentials: "include",
    });
    setGenBusy(false);
    if (res.ok) {
      const { summary } = await res.json();
      setDraft(d => ({ ...d, summary }));   // draft only — edit then Save
    } else {
      const data = await res.json().catch(() => null);
      setErr(data?.detail || "Generation failed.");
    }
  }

  async function remove() {
    const res = await fetch(`${API}/admin/courses/${course.id}`, {
      method: "DELETE", credentials: "include",
    });
    if (res.ok) reload();
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {course.name}
          </span>
          {course.is_currently_learning && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0", whiteSpace: "nowrap" }}>
              Learning
            </span>
          )}
          {course.grade && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid #FDE68A", whiteSpace: "nowrap" }}>
              {course.grade}
            </span>
          )}
          {editMode && unsynced > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", whiteSpace: "nowrap" }}>
              {unsynced} unsynced
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{course.docs.length} note{course.docs.length === 1 ? "" : "s"}</span>
          <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          {!editing && (
            <>
              {course.summary && (
                <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7, marginBottom: 8 }}>{course.summary}</p>
              )}
              {course.notes && (
                <div style={{ marginBottom: 10, padding: "6px 10px", background: "var(--accent-light)", borderRadius: "var(--radius-sm)", border: "1px solid #FDE68A" }}>
                  <p style={{ fontSize: 12, color: "var(--accent-text)" }}>{course.notes}</p>
                </div>
              )}
              {editMode && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button onClick={() => setEditing(true)} className="btn btn-ghost" style={{ fontSize: 12 }}>Edit folder</button>
                  <button onClick={remove} className="btn btn-ghost" style={{ fontSize: 12, color: "#DC2626" }}>Delete (keeps notes)</button>
                </div>
              )}
            </>
          )}

          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "12px", border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Folder name" style={{ ...inputStyle, flex: 1 }} />
                <input value={draft.grade} onChange={e => setDraft(d => ({ ...d, grade: e.target.value }))} placeholder="Grade (e.g. A)" style={{ ...inputStyle, width: 120 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={draft.is_currently_learning}
                    onChange={e => setDraft(d => ({ ...d, is_currently_learning: e.target.checked }))}
                  />
                  Currently learning
                </label>
                <button
                  onClick={aiSummary} disabled={genBusy}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid #FDE68A", cursor: "pointer", opacity: genBusy ? 0.5 : 1 }}
                >
                  {genBusy ? "Generating…" : "Summarise from notes"}
                </button>
              </div>
              <textarea
                value={draft.summary}
                onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))}
                rows={3} placeholder="Folder summary…"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
              />
              <input
                value={draft.notes}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                placeholder="Employer-facing note (optional)…"
                style={inputStyle}
              />
              {err && <p style={{ fontSize: 12, color: "#DC2626" }}>{err}</p>}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={save} disabled={busy} className="btn btn-primary" style={{ fontSize: 12 }}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={NOTE_GRID}>
            {course.docs.map(doc => (
              <DocCard key={doc.id} doc={doc} editMode={editMode} onOpen={() => onOpenDoc(doc)} />
            ))}
            {course.docs.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--fg-subtle)", fontStyle: "italic" }}>Empty folder.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Doc card (grid tile) ─────────────────────────────────

function DocCard({ doc, editMode, onOpen }: {
  doc: PortfolioDoc;
  editMode: boolean;
  onOpen: () => void;
}) {
  const synced = fmtSynced(doc.last_synced_at);

  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", flexDirection: "column", gap: 8, height: "100%",
        padding: "14px 16px", textAlign: "left", cursor: "pointer",
        border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
        background: "var(--bg-secondary)", transition: "border-color .15s, box-shadow .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{doc.display_name}</span>
      </div>

      <p style={{
        fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, margin: 0, flex: 1,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {doc.summary || <span style={{ fontStyle: "italic", color: "var(--fg-subtle)" }}>No summary yet.</span>}
      </p>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: "auto", paddingTop: 4 }}>
        <span style={{ fontSize: 10.5, color: (synced.stale && editMode) ? "#B91C1C" : "var(--fg-subtle)", fontWeight: (synced.stale && editMode) ? 600 : 400 }}>
          {synced.text}
        </span>
        {editMode && doc.needs_review && <span className="tag tag-gray" style={{ fontSize: 9 }}>review</span>}
        {editMode && doc.tag_status === "pending" && <span className="tag tag-gray" style={{ fontSize: 9 }}>untagged</span>}
        {editMode && doc.parse_status === "fallback" && (
          <span className="tag tag-gray" style={{ fontSize: 9 }} title="Multimodal parse failed — text in images is not searchable. Re-ingest to fix.">
            image text missing
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Doc modal (full detail + editor) ─────────────────────

function DocModal({ doc, editMode, allCourses, onClose, reload }: {
  doc: PortfolioDoc;
  editMode: boolean;
  allCourses: { id: string; name: string }[];
  onClose: () => void;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(doc.summary);
  const [skills, setSkills] = useState<string[]>(doc.skills);
  const [newSkill, setNewSkill] = useState("");
  const [courseId, setCourseId] = useState<string>(doc.course_id || "");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState("");

  const synced = fmtSynced(doc.last_synced_at);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  // Re-sync local draft if the underlying doc changes (e.g. after reload).
  useEffect(() => {
    setSummary(doc.summary);
    setSkills(doc.skills);
    setCourseId(doc.course_id || "");
  }, [doc]);

  async function generate() {
    setGenBusy(true); setErr("");
    const res = await fetch(`${API}/admin/documents/${doc.google_doc_id}/generate-tags`, {
      method: "POST", credentials: "include",
    });
    setGenBusy(false);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);   // drafts only — edit, then Save
      setSkills(data.skills);
    } else setErr("Generation failed — try again.");
  }

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${API}/admin/documents/${doc.google_doc_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ summary, skills, course_id: courseId }),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); reload(); } else setErr("Save failed.");
  }

  const metaChip: React.CSSProperties = {
    fontSize: 11, padding: "3px 8px", borderRadius: 20,
    background: "var(--bg-tertiary)", color: "var(--fg-muted)",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)",
          padding: "22px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>{doc.display_name}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          <span style={{ ...metaChip, ...((synced.stale && editMode) ? { background: "#FEF2F2", color: "#B91C1C" } : {}) }}>
            {synced.text}
          </span>
          <span style={metaChip}>{doc.chunk_count} chunk{doc.chunk_count === 1 ? "" : "s"}</span>
          {doc.parse_status === "fallback" && (
            <span style={{ ...metaChip, background: "#FEF2F2", color: "#B91C1C" }} title="Multimodal parse failed — text in images is not searchable. Re-ingest to fix.">
              image text missing
            </span>
          )}
          {doc.parse_status === "multimodal" && <span style={metaChip}>multimodal parse</span>}
          {editMode && doc.needs_review && <span style={metaChip}>changed — review</span>}
          {editMode && (
            <span style={{ ...metaChip, ...(doc.tag_status === "approved" ? { background: "#DCFCE7", color: "#15803D" } : {}) }}>
              {doc.tag_status === "approved" ? "approved" : "untagged"}
            </span>
          )}
        </div>

        {!editing && (
          <>
            <p style={{ fontSize: 14, color: "var(--fg)", lineHeight: 1.75, marginBottom: skills.length ? 14 : 0 }}>
              {doc.summary || <span style={{ fontStyle: "italic", color: "var(--fg-subtle)" }}>No summary yet.</span>}
            </p>
            {doc.skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {doc.skills.map(s => <span key={s} className="tag tag-blue" style={{ fontSize: 11 }}>{s}</span>)}
              </div>
            )}
            {editMode && (
              <button onClick={() => setEditing(true)} className="btn btn-secondary" style={{ fontSize: 12, marginTop: 16 }}>
                Edit note
              </button>
            )}
          </>
        )}

        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Summary</p>
              <button
                onClick={generate} disabled={genBusy}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid #FDE68A", cursor: "pointer", opacity: genBusy ? 0.5 : 1 }}
              >
                {genBusy ? "Generating…" : "Generate suggestions"}
              </button>
            </div>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Skills</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {skills.map(s => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                  {s}
                  <button onClick={() => setSkills(list => list.filter(x => x !== s))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <input
              value={newSkill}
              onChange={e => setNewSkill(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newSkill.trim()) {
                  if (!skills.includes(newSkill.trim())) setSkills(list => [...list, newSkill.trim()]);
                  setNewSkill("");
                }
              }}
              placeholder="Add skill…"
              style={inputStyle}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Folder</span>
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                style={{ ...inputStyle, width: "auto", flex: 1 }}
              >
                <option value="">No folder</option>
                {allCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {err && <p style={{ fontSize: 12, color: "#DC2626" }}>{err}</p>}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={save} disabled={busy} className="btn btn-primary" style={{ fontSize: 12 }}>
                {busy ? "Saving…" : "Save & approve"}
              </button>
              <button onClick={() => setEditing(false)} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
