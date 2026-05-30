"use client";
import { useState, useEffect } from "react";
import PipelineDiagram, { DEFAULT_STAGES, type Stage } from "@/components/portfolio/PipelineDiagram";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Default content — replace with your real text
const DEFAULTS = {
  intro: {
    name: "Hi, I'm Toby",
    tagline: "Information Systems and Accountancy student at SMU",
    bio: "I'm drawn to analytics engineering because it sits right at the intersection of data, technology and business. I enjoy building the systems that turn raw data into real decisions — from database design and pipelines to the dashboards and models that make sense of it all. Outside of tech, I think seriously about long-term investing and have built my own equity analysis platform to put those ideas to work.",
  },
  education: {
    degree: "Bachelor of Science in Information Systems (Business Analytics)",
    double: "Double Degree: Bachelor of Accountancy",
    school: "Singapore Management University",
    period: "Aug 2023 – Nov 2027",
    gpa: "3.93 / 4.0",
    awards: ["Dean's List (all applicable years)", "SCIS Achievements Scholarship", "Teaching Assistant, IS430 Digital Payments and Innovation"],
  },
};

// Types
interface Course {
  id: string;
  name: string;
  institution: string;
  year: number;
  summary: string;
  topics: string[];
}

// ── Inline text editor ────────────────────────────────────────────────
function EditableText({
  value,
  onSave,
  multiline = false,
  style = {},
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);

  function save() {
    onSave(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        style={{
          ...style,
          cursor: "text",
          borderRadius: 4,
          padding: "1px 4px",
          margin: "-1px -4px",
          transition: "background .15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-light)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {value}
        <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 4, opacity: 0.6 }}>✏</span>
      </span>
    );
  }

  // Carry fontSize/fontFamily into the editing container so `inherit` resolves correctly
  const inheritFont: React.CSSProperties = {
    fontSize: style?.fontSize,
    fontFamily: style?.fontFamily,
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, width: "100%", ...inheritFont }}>
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
            color: "var(--fg)", resize: "vertical", fontFamily: "inherit",
            outline: "none",
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

// ── Section wrapper with per-section edit indicator ──────────────────
function Section({
  id,
  editMode,
  children,
}: {
  id: string;
  editMode: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 48,
        padding: editMode ? "16px" : "0",
        border: editMode ? "1px dashed var(--accent)" : "1px solid transparent",
        borderRadius: editMode ? "var(--radius-lg)" : 0,
        position: "relative",
        transition: "border .2s, padding .2s",
      }}
    >
      {editMode && (
        <div style={{
          position: "absolute", top: -10, left: 12,
          background: "var(--accent-light)",
          border: "1px solid var(--accent)",
          borderRadius: 20,
          fontSize: 10, fontWeight: 600,
          color: "var(--accent-text)",
          padding: "1px 8px",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          editing: {id}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Course card ───────────────────────────────────────────────────────
function CourseCard({ course }: { course: Course }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          textAlign: "left", padding: "14px 16px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          background: "var(--bg)", cursor: "pointer",
          transition: "border-color .15s, box-shadow .15s", width: "100%",
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
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{course.name}</p>
        <p style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 8 }}>
          {course.institution} · {course.year}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {course.topics.slice(0, 3).map(t => (
            <span key={t} className="tag tag-gray" style={{ fontSize: 10 }}>{t}</span>
          ))}
        </div>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50, padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fade-in"
            style={{
              background: "var(--bg)", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)", padding: 24,
              maxWidth: 440, width: "100%", boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>{course.name}</h2>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                  {course.institution} · {course.year}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="btn btn-ghost"
                style={{ padding: "4px 8px", fontSize: 18, lineHeight: 1 }}
              >×</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.75, marginBottom: 16 }}>
              {course.summary || "No summary yet. Ingest your course notes to generate one."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {course.topics.map(t => (
                <span key={t} className="tag tag-amber">{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ── Add-course form ───────────────────────────────────────────────────
const BLANK_COURSE = { name: "", institution: "SMU", year: new Date().getFullYear(), summary: "", topics: "" };

function AddCourseForm({ onAdd }: { onAdd: (c: Course) => void }) {
  const [form, setForm] = useState(BLANK_COURSE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API}/admin/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          institution: form.institution.trim() || "SMU",
          year: Number(form.year),
          summary: form.summary.trim(),
          topics: form.topics.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      onAdd(created);
      setForm(BLANK_COURSE);
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally { setSaving(false); }
  }

  const field = (label: string, key: keyof typeof BLANK_COURSE, type = "text") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{
          fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--fg)",
          outline: "none", width: "100%",
        }}
      />
    </div>
  );

  return (
    <form onSubmit={submit} style={{
      marginTop: 16, padding: "16px", border: "1px dashed var(--accent)",
      borderRadius: "var(--radius-md)", background: "var(--bg-secondary)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)" }}>Add new course</p>
      {field("Course name", "name")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
        {field("Institution", "institution")}
        {field("Year", "year", "number")}
      </div>
      {field("Topics (comma-separated)", "topics")}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary</label>
        <textarea
          value={form.summary}
          onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
          rows={3}
          style={{
            fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--fg)",
            outline: "none", resize: "vertical", fontFamily: "inherit", width: "100%",
          }}
        />
      </div>
      {err && <p style={{ fontSize: 12, color: "#DC2626" }}>{err}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start", fontSize: 12 }}>
        {saving ? "Saving…" : "Add course"}
      </button>
    </form>
  );
}

// ── Pipeline skills editor ────────────────────────────────────────────
function PipelineSkillsEditor({ stages, onChange }: { stages: Stage[]; onChange: (s: Stage[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState<Record<string, string>>({});

  function removeSkill(stageId: string, skill: string) {
    onChange(stages.map(s => s.id === stageId ? { ...s, skills: s.skills.filter(sk => sk !== skill) } : s));
  }

  function addSkill(stageId: string) {
    const val = (newSkill[stageId] || "").trim();
    if (!val) return;
    onChange(stages.map(s => s.id === stageId ? { ...s, skills: [...s.skills, val] } : s));
    setNewSkill(p => ({ ...p, [stageId]: "" }));
  }

  return (
    <div style={{ marginTop: 16, border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: "var(--accent-light)", borderBottom: "1px dashed var(--accent)" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Edit pipeline skills
        </p>
      </div>
      {stages.map(stage => (
        <div key={stage.id} style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setOpenId(openId === stage.id ? null : stage.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: stage.borderColor, display: "inline-block" }} />
              {stage.label}
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg-subtle)" }}>({stage.skills.length} skills)</span>
            </span>
            <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{openId === stage.id ? "▴" : "▾"}</span>
          </button>
          {openId === stage.id && (
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {stage.skills.map(skill => (
                  <span key={skill} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 12, padding: "3px 8px 3px 10px",
                    borderRadius: 20, border: `1px solid ${stage.borderColor}50`,
                    background: stage.color,
                  }}>
                    {skill}
                    <button onClick={() => removeSkill(stage.id, skill)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: 0,
                    }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={newSkill[stage.id] || ""}
                  onChange={e => setNewSkill(p => ({ ...p, [stage.id]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addSkill(stage.id)}
                  placeholder="Add skill…"
                  style={{
                    flex: 1, fontSize: 12, padding: "5px 10px",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    background: "var(--bg)", color: "var(--fg)", outline: "none",
                  }}
                />
                <button onClick={() => addSkill(stage.id)} className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }}>
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [editMode, setEditMode]      = useState(false);
  const [isAdmin, setIsAdmin]        = useState(false);
  const [courses, setCourses]        = useState<Course[]>([]);
  const [content, setContent]        = useState(DEFAULTS);
  const [savedMsg, setSavedMsg]      = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<Stage[]>(() => DEFAULT_STAGES.map(s => ({ ...s, skills: [...s.skills] })));

  // Check admin
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  // Load courses from Supabase via API
  useEffect(() => {
    fetch(`${API}/courses`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function deleteCourse(id: string) {
    await fetch(`${API}/admin/courses/${id}`, { method: "DELETE", credentials: "include" });
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  function updateField(section: keyof typeof DEFAULTS, field: string, value: string) {
    setContent(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
    // Auto-save to backend
    fetch(`${API}/admin/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ section, field, value }),
    }).then(() => {
      setSavedMsg(`Saved ${field}`);
      setTimeout(() => setSavedMsg(null), 2000);
    }).catch(() => {});
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

      {/* Edit mode toggle — admin only */}
      {isAdmin && (
        <div style={{
          position: "fixed", top: 80, right: 24, zIndex: 40,
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
        }}>
          {savedMsg && (
            <div style={{
              background: "var(--fg)", color: "var(--bg)",
              fontSize: 11, padding: "4px 10px", borderRadius: 20,
              boxShadow: "var(--shadow-sm)",
            }}>{savedMsg}</div>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            style={{
              height: 34, borderRadius: 17,
              padding: "0 14px",
              background: editMode ? "var(--fg)" : "var(--bg)",
              color: editMode ? "var(--bg)" : "var(--fg-muted)",
              border: editMode ? "1px solid var(--fg)" : "1px solid var(--border-strong)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all .15s",
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
              value={content.intro.name}
              onSave={v => updateField("intro", "name", v)}
              style={{ fontSize: 28, fontWeight: 700, display: "block" }}
            />
          ) : (
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{content.intro.name}</h1>
          )}
        </div>
        <div style={{ marginBottom: 12 }}>
          {editMode ? (
            <EditableText
              value={content.intro.tagline}
              onSave={v => updateField("intro", "tagline", v)}
              style={{ fontSize: 16, color: "var(--fg-muted)", display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 16, color: "var(--fg-muted)", marginBottom: 12 }}>{content.intro.tagline}</p>
          )}
        </div>
        <div>
          {editMode ? (
            <EditableText
              value={content.intro.bio}
              onSave={v => updateField("intro", "bio", v)}
              multiline
              style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8, display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.8 }}>{content.intro.bio}</p>
          )}
        </div>
      </Section>

      {/* ── Pipeline diagram ───────────────────── */}
      <Section id="skills-pipeline" editMode={editMode}>
        <p className="section-label" style={{ marginBottom: 20 }}>Skills pipeline</p>
        <PipelineDiagram stages={pipelineStages} />
        {editMode && (
          <PipelineSkillsEditor stages={pipelineStages} onChange={setPipelineStages} />
        )}
      </Section>

      {/* ── Education + Academic modules (merged) ── */}
      <Section id="education" editMode={editMode}>
        {/* Compact education header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          flexWrap: "wrap", gap: 8, marginBottom: 6,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{content.education.school}</p>
            <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
              {content.education.degree} · {content.education.double} · {content.education.period}
            </p>
          </div>
          <span className="tag tag-amber">cGPA {content.education.gpa}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 28 }}>
          {content.education.awards.map(a => (
            <span key={a} className="tag tag-gray" style={{ fontSize: 11 }}>{a}</span>
          ))}
        </div>

        {/* Academic modules */}
        <p className="section-label">
          Academic modules
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8 }}>
            · click to expand
          </span>
        </p>
        {courses.length === 0 && !editMode ? (
          <div style={{ padding: "24px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No courses yet. Enable edit mode to add courses.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {courses.map(course => (
              <div key={course.id} style={{ position: "relative" }}>
                <CourseCard course={course} />
                {editMode && (
                  <button
                    onClick={() => deleteCourse(course.id)}
                    title="Delete course"
                    style={{
                      position: "absolute", top: 6, right: 6,
                      width: 22, height: 22, borderRadius: "50%",
                      background: "#DC2626", color: "#fff",
                      border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
        {editMode && <AddCourseForm onAdd={c => setCourses(prev => [c, ...prev])} />}
      </Section>

    </main>
  );
}