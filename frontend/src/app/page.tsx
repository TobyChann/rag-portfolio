"use client";
import { useState, useEffect } from "react";
import PipelineDiagram from "@/components/portfolio/PipelineDiagram";

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

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {multiline ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          style={{
            width: "100%", fontSize: "inherit", lineHeight: 1.7,
            padding: "6px 8px", border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)", background: "var(--bg)",
            color: "var(--fg)", resize: "vertical", fontFamily: "inherit",
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
            borderRadius: "var(--radius-sm)", background: "var(--bg)",
            color: "var(--fg)", fontFamily: "inherit",
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


// ── Main page ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [editMode, setEditMode]   = useState(false);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [courses, setCourses]     = useState<Course[]>([]);
  const [content, setContent]     = useState(DEFAULTS);
  const [savedMsg, setSavedMsg]   = useState<string | null>(null);

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
          position: "fixed", bottom: 88, right: 24, zIndex: 40,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
        }}>
          {savedMsg && (
            <div style={{
              background: "var(--accent)", color: "#fff",
              fontSize: 12, padding: "5px 12px", borderRadius: 20,
              boxShadow: "var(--shadow-sm)",
              animation: "fadeIn .2s ease",
            }}>{savedMsg}</div>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            className="btn btn-primary"
            style={{
              boxShadow: "var(--shadow-md)",
              background: editMode ? "#6366F1" : "var(--accent)",
              borderColor: editMode ? "#6366F1" : "var(--accent)",
            }}
          >
            {editMode ? "Exit edit mode" : "Edit page"}
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
        <PipelineDiagram />
      </Section>

      {/* ── Education ──────────────────────────── */}
      <Section id="education" editMode={editMode}>
        <p className="section-label">Education</p>
        <div style={{
          padding: "16px 20px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              {editMode ? (
                <EditableText
                  value={content.education.school}
                  onSave={v => updateField("education", "school", v)}
                  style={{ fontSize: 14, fontWeight: 600, display: "block" }}
                />
              ) : (
                <p style={{ fontSize: 14, fontWeight: 600 }}>{content.education.school}</p>
              )}
              <div style={{ marginTop: 4 }}>
                {editMode ? (
                  <EditableText
                    value={content.education.degree}
                    onSave={v => updateField("education", "degree", v)}
                    style={{ fontSize: 13, color: "var(--fg-muted)", display: "block" }}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>{content.education.degree}</p>
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 2 }}>{content.education.double}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>{content.education.period}</p>
              <span className="tag tag-amber" style={{ marginTop: 4, display: "inline-block" }}>
                cGPA {content.education.gpa}
              </span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {content.education.awards.map(a => (
              <span key={a} className="tag tag-gray" style={{ fontSize: 11 }}>{a}</span>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Courses ────────────────────────────── */}
      <Section id="courses" editMode={editMode}>
        <p className="section-label">
          Academic modules
          <span style={{
            textTransform: "none", letterSpacing: 0,
            fontWeight: 400, color: "var(--fg-subtle)", marginLeft: 8,
          }}>
            · click to expand
          </span>
        </p>
        {courses.length === 0 ? (
          <div style={{
            padding: "24px", border: "1px dashed var(--border)",
            borderRadius: "var(--radius-md)", textAlign: "center",
          }}>
            <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
              No courses loaded yet. Ingest your Notes_ documents from the admin panel to populate this section.
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 12,
          }}>
            {courses.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </Section>

    </main>
  );
}