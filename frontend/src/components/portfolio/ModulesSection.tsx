// frontend/src/components/portfolio/ModulesSection.tsx
"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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
}

interface PortfolioCourse {
  id: string;
  name: string;
  summary: string;
  is_currently_learning: boolean;
  notes: string;
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

export default function ModulesSection({ editMode }: { editMode: boolean }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Couldn't load modules.");
    }
  }

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
          openDoc={openDoc}
          setOpenDoc={setOpenDoc}
          editMode={editMode}
          allCourses={allCourses}
          reload={load}
        />
      ))}

      {data.loose_docs.length > 0 && (
        <div>
          {data.courses.length > 0 && (
            <p className="section-label" style={{ margin: "8px 0" }}>Other notes</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.loose_docs.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                open={openDoc === doc.id}
                onToggle={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
                editMode={editMode}
                allCourses={allCourses}
                reload={load}
              />
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
    </div>
  );
}

// ─── Course folder ────────────────────────────────────────

function CourseFolder({
  course, open, onToggle, openDoc, setOpenDoc, editMode, allCourses, reload,
}: {
  course: PortfolioCourse;
  open: boolean;
  onToggle: () => void;
  openDoc: string | null;
  setOpenDoc: (id: string | null) => void;
  editMode: boolean;
  allCourses: { id: string; name: string }[];
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: course.name, summary: course.summary,
    is_currently_learning: course.is_currently_learning, notes: course.notes,
  });
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState("");

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
          <span style={{ fontSize: 14 }}>📁</span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {course.name}
          </span>
          {course.is_currently_learning && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0", whiteSpace: "nowrap" }}>
              Learning
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
                  <p style={{ fontSize: 12, color: "var(--accent-text)" }}>📝 {course.notes}</p>
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
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
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
                  {genBusy ? "Generating…" : "✨ Summarise from notes"}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {course.docs.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                open={openDoc === doc.id}
                onToggle={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
                editMode={editMode}
                allCourses={allCourses}
                reload={reload}
              />
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

// ─── Doc row ──────────────────────────────────────────────

function DocRow({
  doc, open, onToggle, editMode, allCourses, reload,
}: {
  doc: PortfolioDoc;
  open: boolean;
  onToggle: () => void;
  editMode: boolean;
  allCourses: { id: string; name: string }[];
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

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          📄 {doc.display_name}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {editMode && doc.needs_review && <span className="tag tag-gray">changed — review</span>}
          {editMode && doc.tag_status === "pending" && <span className="tag tag-gray">untagged</span>}
          {editMode && doc.parse_status === "fallback" && (
            <span className="tag tag-gray" title="Multimodal parse failed — text in images is not searchable. Re-ingest to fix.">
              ⚠ image text missing
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          {!editing && (
            <>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7, marginBottom: skills.length ? 8 : 0 }}>
                {doc.summary || <span style={{ fontStyle: "italic", color: "var(--fg-subtle)" }}>No summary yet.</span>}
              </p>
              {doc.skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {doc.skills.map(s => <span key={s} className="tag tag-blue" style={{ fontSize: 10 }}>{s}</span>)}
                </div>
              )}
              {editMode && (
                <button onClick={() => setEditing(true)} className="btn btn-ghost" style={{ fontSize: 12, marginTop: 8 }}>
                  Edit
                </button>
              )}
            </>
          )}

          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)", background: "var(--bg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Summary</p>
                <button
                  onClick={generate} disabled={genBusy}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid #FDE68A", cursor: "pointer", opacity: genBusy ? 0.5 : 1 }}
                >
                  {genBusy ? "Generating…" : "✨ Generate suggestions"}
                </button>
              </div>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                rows={3}
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
      )}
    </div>
  );
}