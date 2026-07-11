"use client";
import { useState, useEffect } from "react";
import PipelineDiagram, { DEFAULT_STAGES, type Stage } from "@/components/portfolio/PipelineDiagram";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ─── Types ────────────────────────────────────────────────────────────

interface Course {
  id: string;
  name: string;
  institution: string;
  year: number;
  summary: string;
  topics: string[];
  linked_doc_ids: string[];
  is_currently_learning: boolean;
  is_self_explored: boolean;
  notes: string;
}

interface DocOption {
  id: string;
  google_doc_id: string;
  title: string;
  topic: string;
}

interface PipelineBar {
  label: string;
  items: string[];
}

type HomeContent = Record<string, Record<string, string>>;

// ─── Editable text ────────────────────────────────────────────────────

function EditableText({
  value,
  placeholder,
  onSave,
  multiline = false,
  style = {},
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  function save() { onSave(draft); setEditing(false); }
  function cancel() { setDraft(value); setEditing(false); }

  if (!editing) {
    return (
      <span
        style={{ ...style, cursor: "text", borderRadius: 4, padding: "1px 4px", margin: "-1px -4px", transition: "background .15s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-light)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {value || <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>{placeholder || "Click to add…"}</span>}
        <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 4, opacity: 0.6 }}>✏</span>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, width: "100%", fontSize: style?.fontSize, fontFamily: style?.fontFamily }}>
      {multiline ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={5}
          style={{
            width: "100%", fontSize: "inherit", lineHeight: 1.7,
            padding: "8px 10px", border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)",
            color: "var(--fg)", resize: "vertical", fontFamily: "inherit", outline: "none",
          }}
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{
            width: "100%", fontSize: "inherit",
            padding: "4px 8px", border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)",
            color: "var(--fg)", fontFamily: "inherit", outline: "none",
          }}
        />
      )}
      <span style={{ display: "flex", gap: 6 }}>
        <button onClick={save} className="btn btn-primary" style={{ fontSize: 11, padding: "3px 10px" }}>Save</button>
        <button onClick={cancel} className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }}>Cancel</button>
      </span>
    </span>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────

function Section({ id, editMode, children }: { id: string; editMode: boolean; children: React.ReactNode }) {
  return (
    <section style={{
      marginBottom: 48,
      padding: editMode ? "16px" : "0",
      border: editMode ? "1px dashed var(--accent)" : "1px solid transparent",
      borderRadius: editMode ? "var(--radius-lg)" : 0,
      position: "relative",
      transition: "border .2s, padding .2s",
    }}>
      {editMode && (
        <div style={{
          position: "absolute", top: -10, left: 12,
          background: "var(--accent-light)", border: "1px solid var(--accent)",
          borderRadius: 20, fontSize: 10, fontWeight: 600,
          color: "var(--accent-text)", padding: "1px 8px",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          editing: {id}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Course card (view) ───────────────────────────────────────────────

function CourseCard({ course, docs }: { course: Course; docs: DocOption[] }) {
  const [open, setOpen] = useState(false);
  const linkedDocs = docs.filter(d => (course.linked_doc_ids || []).includes(d.google_doc_id));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          textAlign: "left", padding: "14px 16px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          background: "var(--bg)", cursor: "pointer",
          transition: "border-color .15s, box-shadow .15s", width: "100%",
          position: "relative",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
          (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        {/* Status badges — top right */}
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
          {course.is_currently_learning && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0", whiteSpace: "nowrap" }}>
              Learning
            </span>
          )}
          {course.is_self_explored && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", whiteSpace: "nowrap" }}>
              Self-explored
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, paddingRight: course.is_currently_learning || course.is_self_explored ? 80 : 0 }}>{course.name}</p>
        <p style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 8 }}>{course.institution} · {course.year}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {course.topics.slice(0, 3).map(t => (
            <span key={t} className="tag tag-gray" style={{ fontSize: 10 }}>{t}</span>
          ))}
        </div>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fade-in"
            style={{ background: "var(--bg)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 24, maxWidth: 480, width: "100%", boxShadow: "var(--shadow-md)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600 }}>{course.name}</h2>
                  {course.is_currently_learning && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0" }}>Currently learning</span>
                  )}
                  {course.is_self_explored && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Self-explored</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>{course.institution} · {course.year}</p>
              </div>
              <button onClick={() => setOpen(false)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.75, marginBottom: course.notes ? 12 : 16 }}>
              {course.summary || "No description yet."}
            </p>
            {course.notes && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "var(--accent-light)", borderRadius: "var(--radius-sm)", border: "1px solid #FDE68A" }}>
                <p style={{ fontSize: 12, color: "var(--accent-text)" }}>📝 {course.notes}</p>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: linkedDocs.length ? 12 : 0 }}>
              {course.topics.map(t => (
                <span key={t} className="tag tag-amber">{t}</span>
              ))}
            </div>
            {linkedDocs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Linked notes</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {linkedDocs.map(d => (
                    <span key={d.id} className="tag tag-blue" style={{ fontSize: 10 }}>📄 {d.title}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Course form (add + edit) ─────────────────────────────────────────

function CourseForm({
  initial,
  docs,
  onSave,
  onCancel,
}: {
  initial?: Course | null;
  docs: DocOption[];
  onSave: (c: Course) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    institution: initial?.institution ?? "SMU",
    year: initial?.year ?? new Date().getFullYear(),
    summary: initial?.summary ?? "",
    topics: (initial?.topics ?? []).join(", "),
    notes: initial?.notes ?? "",
    linked_doc_ids: initial?.linked_doc_ids ?? [],
    is_currently_learning: initial?.is_currently_learning ?? false,
    is_self_explored: initial?.is_self_explored ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [generating, setGenerating] = useState(false);

  async function generateDescription() {
    setGenerating(true);
    try {
      const topicsList = form.topics.split(",").map(t => t.trim()).filter(Boolean);
      const linkedTitles = docs.filter(d => form.linked_doc_ids.includes(d.google_doc_id)).map(d => d.title);
      const res = await fetch(`${API}/courses/generate-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_name: form.name,
          institution: form.institution,
          topics: topicsList,
          linked_doc_titles: linkedTitles,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const { description } = await res.json();
      setForm(f => ({ ...f, summary: description }));
    } catch (e: any) {
      setErr(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const payload = {
        name: form.name.trim(),
        institution: form.institution.trim() || "SMU",
        year: Number(form.year),
        summary: form.summary.trim(),
        topics: form.topics.split(",").map(t => t.trim()).filter(Boolean),
        notes: form.notes.trim(),
        linked_doc_ids: form.linked_doc_ids,
        is_currently_learning: form.is_currently_learning,
        is_self_explored: form.is_self_explored,
      };
      const url = isEdit ? `${API}/admin/courses/${initial!.id}` : `${API}/admin/courses`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      onSave(saved);
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally { setSaving(false); }
  }

  function toggleDoc(googleDocId: string) {
    setForm(f => ({
      ...f,
      linked_doc_ids: f.linked_doc_ids.includes(googleDocId)
        ? f.linked_doc_ids.filter(id => id !== googleDocId)
        : [...f.linked_doc_ids, googleDocId],
    }));
  }

  const inputStyle = {
    fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--fg)",
    outline: "none", width: "100%",
  };

  return (
    <form onSubmit={submit} style={{
      marginTop: 16, padding: "16px", border: "1px dashed var(--accent)",
      borderRadius: "var(--radius-md)", background: "var(--bg-secondary)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)" }}>
        {isEdit ? `Editing: ${initial!.name}` : "Add new course / module"}
      </p>

      {/* Name */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Course / module name</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
      </div>

      {/* Institution + Year */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Institution</label>
          <input value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Year</label>
          <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} style={inputStyle} />
        </div>
      </div>

      {/* Topics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Topics (comma-separated)</label>
        <input value={form.topics} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} style={inputStyle} />
      </div>

      {/* Flags */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.is_currently_learning}
            onChange={e => setForm(f => ({ ...f, is_currently_learning: e.target.checked }))}
          />
          <span>Currently learning</span>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0" }}>green badge</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.is_self_explored}
            onChange={e => setForm(f => ({ ...f, is_self_explored: e.target.checked }))}
          />
          <span>Self-explored (outside curriculum)</span>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>blue badge</span>
        </label>
      </div>

      {/* Note for employer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Note / tag for employer (optional)</label>
        <input
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="e.g. Applied in capstone project, Pursuing CFA Level 1…"
          style={inputStyle}
        />
      </div>

      {/* Linked documents */}
      {docs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Link to ingested documents (for RAG + AI description)</label>
          <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)" }}>
            {docs.map(doc => (
              <label key={doc.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                borderBottom: "1px solid var(--border)", cursor: "pointer",
                background: form.linked_doc_ids.includes(doc.google_doc_id) ? "var(--accent-light)" : "transparent",
                transition: "background .1s",
              }}>
                <input
                  type="checkbox"
                  checked={form.linked_doc_ids.includes(doc.google_doc_id)}
                  onChange={() => toggleDoc(doc.google_doc_id)}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ fontSize: 12 }}>{doc.title}</span>
                {doc.topic && <span className="tag tag-gray" style={{ fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>{doc.topic}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Summary + AI generate */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</label>
          <button
            type="button"
            onClick={generateDescription}
            disabled={generating || !form.name.trim()}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)",
              background: "var(--accent-light)", color: "var(--accent-text)",
              border: "1px solid #FDE68A", cursor: "pointer",
              opacity: (generating || !form.name.trim()) ? 0.5 : 1,
            }}
          >
            {generating ? "Generating…" : "✨ AI generate"}
          </button>
        </div>
        <textarea
          value={form.summary}
          onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
          rows={3}
          placeholder="Describe what you learned and skills gained…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
        />
      </div>

      {err && <p style={{ fontSize: 12, color: "#DC2626" }}>{err}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 12 }}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add course"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────

export default function HomePage() {
  const [editMode, setEditMode]   = useState(false);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [courses, setCourses]     = useState<Course[]>([]);
  const [docs, setDocs]           = useState<DocOption[]>([]);
  const [content, setContent]     = useState<HomeContent>({});
  const [savedMsg, setSavedMsg]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editingCourse, setEditingCourse] = useState<Course | null | "new">(null);
  const [pipelineStages, setPipelineStages] = useState<Stage[]>(() =>
    DEFAULT_STAGES.map(s => ({ ...s, skills: [...s.skills] }))
  );
  const [pipelineBars, setPipelineBars] = useState<Record<string, PipelineBar>>({
    top_bar:    { label: "Project Management", items: [] },
    db_layer:   { label: "Database Layer", items: [] },
    bottom_bar: { label: "Infrastructure Design", items: [] },
  });

  // Check admin
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  // Load everything.
  // The diagram renders from /api/skills — the curated Skill inventory
  // (Admin → Skills) is the single source of truth. Categories with no
  // DB skills fall back to the hardcoded defaults so it never renders blank.
  useEffect(() => {
    Promise.all([
      fetch(`${API}/courses`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/courses/documents`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/admin/content`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/skills`).then(r => r.ok ? r.json() : {}) as Promise<Record<string, string[]>>,
    ]).then(([coursesData, docsData, contentData, skillsData]) => {
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setDocs(Array.isArray(docsData) ? docsData : []);
      setContent(contentData || {});
      if (skillsData && Object.keys(skillsData).length > 0) {
        setPipelineStages(DEFAULT_STAGES.map(s => ({
          ...s,
          skills: skillsData[s.id] ?? s.skills,
        })));
        setPipelineBars(prev => ({
          top_bar:    { ...prev.top_bar,    items: skillsData.top_bar    ?? [] },
          db_layer:   { ...prev.db_layer,   items: skillsData.db_layer   ?? [] },
          bottom_bar: { ...prev.bottom_bar, items: skillsData.bottom_bar ?? [] },
        }));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function getField(section: string, field: string, fallback = ""): string {
    return content?.[section]?.[field] ?? fallback;
  }

  async function updateField(section: string, field: string, value: string) {
    setContent(prev => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [field]: value },
    }));
    try {
      await fetch(`${API}/admin/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section, field, value }),
      });
      setSavedMsg(`Saved`);
      setTimeout(() => setSavedMsg(null), 2000);
    } catch {}
  }

  async function deleteCourse(id: string) {
    await fetch(`${API}/admin/courses/${id}`, { method: "DELETE", credentials: "include" });
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  function handleCourseSaved(saved: Course) {
    setCourses(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setEditingCourse(null);
  }

  if (loading) return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center", color: "var(--fg-muted)", fontSize: 14 }}>
      Loading…
    </main>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

      {/* Admin edit toggle */}
      {isAdmin && (
        <div style={{ position: "fixed", top: 80, right: 24, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {savedMsg && (
            <div style={{ background: "var(--fg)", color: "var(--bg)", fontSize: 11, padding: "4px 10px", borderRadius: 20, boxShadow: "var(--shadow-sm)" }}>
              {savedMsg}
            </div>
          )}
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
            {editMode ? "Done editing" : "Edit"}
          </button>
        </div>
      )}

      {/* ── Intro ──────────────────────────────── */}
      <Section id="intro" editMode={editMode}>
        <div style={{ marginBottom: 8 }}>
          {editMode ? (
            <EditableText
              value={getField("intro", "name")}
              placeholder="Hi, I'm …"
              onSave={v => updateField("intro", "name", v)}
              style={{ fontSize: 28, fontWeight: 700, display: "block" }}
            />
          ) : (
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
              {getField("intro", "name") || <span style={{ color: "var(--fg-subtle)" }}>Add your name…</span>}
            </h1>
          )}
        </div>
        <div style={{ marginBottom: 12 }}>
          {editMode ? (
            <EditableText
              value={getField("intro", "tagline")}
              placeholder="Your tagline / role…"
              onSave={v => updateField("intro", "tagline", v)}
              style={{ fontSize: 16, color: "var(--fg-muted)", display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 16, color: "var(--fg-muted)", marginBottom: 12 }}>
              {getField("intro", "tagline") || <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>Add a tagline…</span>}
            </p>
          )}
        </div>
        <div>
          {editMode ? (
            <EditableText
              value={getField("intro", "bio")}
              placeholder="Write your bio…"
              onSave={v => updateField("intro", "bio", v)}
              multiline
              style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8, display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8 }}>
              {getField("intro", "bio") || <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>Add your bio…</span>}
            </p>
          )}
        </div>
      </Section>

      {/* ── Skills pipeline ─────────────────────── */}
      <Section id="skills-pipeline" editMode={editMode}>
        <p className="section-label" style={{ marginBottom: 20 }}>Skills pipeline</p>
        <PipelineDiagram
          stages={pipelineStages}
          topBar={pipelineBars.top_bar}
          dbLayer={pipelineBars.db_layer}
          bottomBar={pipelineBars.bottom_bar}
        />
        {editMode && (
          <div style={{
            marginTop: 16, padding: "12px 16px",
            border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)",
            background: "var(--accent-light)",
          }}>
            <p style={{ fontSize: 12, color: "var(--accent-text)", lineHeight: 1.7 }}>
              This diagram renders from your curated skill inventory.
              Manage it in <a href="/admin" style={{ fontWeight: 600, color: "inherit", textDecoration: "underline" }}>Admin → Skills</a> —
              drag skills onto a category to publish them here.
            </p>
          </div>
        )}
      </Section>

      {/* ── Education ──────────────────────────── */}
      <Section id="education" editMode={editMode}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          <div>
            {editMode ? (
              <>
                <EditableText value={getField("education", "school")} placeholder="University name…" onSave={v => updateField("education", "school", v)} style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 4 }} />
                <EditableText value={getField("education", "degree")} placeholder="Degree name…" onSave={v => updateField("education", "degree", v)} style={{ fontSize: 12, color: "var(--fg-muted)", display: "block" }} />
                <EditableText value={getField("education", "double")} placeholder="Double degree (optional)…" onSave={v => updateField("education", "double", v)} style={{ fontSize: 12, color: "var(--fg-muted)", display: "block" }} />
                <EditableText value={getField("education", "period")} placeholder="Aug 2023 – Nov 2027" onSave={v => updateField("education", "period", v)} style={{ fontSize: 12, color: "var(--fg-muted)", display: "block" }} />
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{getField("education", "school")}</p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                  {[getField("education", "degree"), getField("education", "double"), getField("education", "period")].filter(Boolean).join(" · ")}
                </p>
              </>
            )}
          </div>
          {editMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>cGPA</span>
              <EditableText value={getField("education", "gpa")} placeholder="3.00 / 4.00" onSave={v => updateField("education", "gpa", v)} style={{ fontSize: 11 }} />
            </div>
          ) : (
            getField("education", "gpa") && <span className="tag tag-amber">cGPA {getField("education", "gpa")}</span>
          )}
        </div>

        {/* Awards — editable as a textarea of newline-separated items */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 28 }}>
          {editMode ? (
            <div style={{ width: "100%" }}>
              <p style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 4 }}>Awards / distinctions (one per line)</p>
              <EditableText
                value={getField("education", "awards")}
                placeholder={"Dean's List\nScholarship\nTA role…"}
                onSave={v => updateField("education", "awards", v)}
                multiline
                style={{ fontSize: 12, display: "block" }}
              />
            </div>
          ) : (
            getField("education", "awards")
              .split("\n")
              .filter(Boolean)
              .map(a => <span key={a} className="tag tag-gray" style={{ fontSize: 11 }}>{a}</span>)
          )}
        </div>

        {/* Academic modules */}
        <p className="section-label">
          Academic modules
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8 }}>· click to expand</span>
        </p>

        {courses.length === 0 && !editMode ? (
          <div style={{ padding: "24px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No courses yet. Enable edit mode to add courses.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {courses.map(course => (
              <div key={course.id} style={{ position: "relative" }}>
                <CourseCard course={course} docs={docs} />
                {editMode && (
                  <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3 }}>
                    <button
                      onClick={() => setEditingCourse(course)}
                      title="Edit course"
                      style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >✏</button>
                    <button
                      onClick={() => deleteCourse(course.id)}
                      title="Delete course"
                      style={{ width: 22, height: 22, borderRadius: "50%", background: "#DC2626", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {editMode && editingCourse === "new" && (
          <CourseForm docs={docs} onSave={handleCourseSaved} onCancel={() => setEditingCourse(null)} />
        )}
        {editMode && editingCourse && editingCourse !== "new" && (
          <CourseForm initial={editingCourse} docs={docs} onSave={handleCourseSaved} onCancel={() => setEditingCourse(null)} />
        )}
        {editMode && editingCourse === null && (
          <button
            onClick={() => setEditingCourse("new")}
            className="btn btn-secondary"
            style={{ marginTop: 12, fontSize: 12 }}
          >
            + Add course / module
          </button>
        )}
      </Section>

    </main>
  );
}