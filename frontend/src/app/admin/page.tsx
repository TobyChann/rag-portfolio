"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Stats {
  total_queries: number;
  total_visitors: number;
  total_docs: number;
  role_breakdown: Record<string, number>;
  recent_queries: {
    question: string;
    answer: string;
    feedback: number;
    cache_hit: string | null;
    response_ms: number;
    created_at: string;
  }[];
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestLog, setIngestLog] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [tab, setTab] = useState<"dashboard" | "ingest" | "settings">("dashboard");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [docId, setDocId] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch(`${API}/admin/me`, { credentials: "include" });
      if (!res.ok) { router.push("/login"); return; }
      loadStats();
    } catch {
      router.push("/login");
    }
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API}/admin/stats`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setStats(await res.json());
    } catch {
      // stats fail silently
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch(`${API}/admin/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
  }

  async function handleIngestAll() {
    setIngesting(true);
    setIngestLog("");
    setJobProgress(null);
    try {
      const res = await fetch(`${API}/admin/ingest/all`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      setJobId(job_id);
      localStorage.setItem("ingest_job_id", job_id);
      // Poll for progress
      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/admin/ingest/status/${job_id}`, { credentials: "include" });
          const status = await sr.json();
          setJobProgress({ done: status.done, total: status.total, current: status.current });
          if (status.status === "done") {
            clearInterval(poll);
            setIngesting(false);
            setIngestLog(`Done. ${status.done} documents ingested.\n\n${status.results.map((r: any) => `${r.title}: ${r.chunks} chunks (${r.ms}ms)`).join("\n")}`);
            setJobProgress(null);
            loadStats();
          } else if (status.status === "error") {
            clearInterval(poll);
            setIngesting(false);
            setIngestLog(`Error: ${status.error}`);
            setJobProgress(null);
          }
        } catch { clearInterval(poll); setIngesting(false); }
      }, 2000);
    } catch (e: any) {
      setIngestLog(`Error: ${e.message}`);
      setIngesting(false);
    }
  }

  async function handleIngestOne() {
    if (!docId.trim()) return;
    setIngesting(true);
    setIngestLog(`Ingesting ${docId}...`);
    try {
      const res = await fetch(`${API}/admin/ingest/doc/${docId}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      setIngestLog(`Done. ${data.title}: ${data.chunk_count} chunks in ${data.elapsed_ms}ms`);
    } catch {
      setIngestLog("Error. Check backend logs.");
    } finally {
      setIngesting(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    try {
      const res = await fetch(`${API}/admin/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setPwMsg(`New hash generated. Copy into ADMIN_PASSWORD_HASH in .env and restart backend:\n\n${data.new_hash}`);
      setCurrentPw(""); setNewPw("");
    } catch (e: any) {
      setPwMsg(`Error: ${e.message}`);
    }
  }

  if (loading) return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px", color: "var(--fg-muted)", fontSize: 14 }}>
      Loading...
    </main>
  );

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Admin dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 2 }}>
            Welcome back, Toby
          </p>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary" style={{ fontSize: 12 }}>
          Sign out
        </button>
      </div>

      {/* Tab strip */}
      <div className="tab-strip">
        {(["dashboard", "ingest", "settings"] as const).map(t => (
          <button key={t} className={`tab-item${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {tab === "dashboard" && stats && (
        <div className="fade-in">
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Total queries", value: stats.total_queries },
              { label: "Unique visitors", value: stats.total_visitors },
              { label: "Docs indexed", value: stats.total_docs },
            ].map(s => (
              <div key={s.label} style={{
                padding: "16px 20px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
              }}>
                <p style={{ fontSize: 22, fontWeight: 600 }}>{s.value}</p>
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Role breakdown */}
          <div style={{ marginBottom: 28 }}>
            <p className="section-label">Visitor roles</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(stats.role_breakdown).map(([role, count]) => (
                <div key={role} style={{
                  padding: "8px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                  <span style={{ color: "var(--fg-muted)", marginLeft: 6 }}>{role.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent queries */}
          <div>
            <p className="section-label">Recent questions</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {stats.recent_queries.map((q, i) => (
                <div key={i} style={{
                  padding: "12px 0",
                  borderBottom: i < stats.recent_queries.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{q.question}</p>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {q.cache_hit && <span className="tag tag-green">{q.cache_hit} hit</span>}
                      {q.feedback === 1 && <span className="tag tag-green">thumbs up</span>}
                      {q.feedback === -1 && <span className="tag tag-gray">thumbs down</span>}
                      <span className="tag tag-gray">{q.response_ms}ms</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4, lineHeight: 1.6 }}>{q.answer}</p>
                  <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>
                    {new Date(q.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ingest tab */}
      {tab === "ingest" && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{
            padding: "16px 20px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-secondary)",
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ingest all documents</p>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 16, lineHeight: 1.7 }}>
              Re-ingests all files in your Google Drive folder that match the <code style={{ background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>Notes_</code> prefix.
              Only changed chunks are replaced in Zilliz.
            </p>
            <button
              onClick={handleIngestAll}
              disabled={ingesting}
              className="btn btn-primary"
              style={{ opacity: ingesting ? 0.6 : 1 }}
            >
              {ingesting ? "Running in background…" : "Ingest all Notes_ documents"}
            </button>

            {jobProgress && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    {jobProgress.current ? `Processing: ${jobProgress.current}` : "Starting…"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {jobProgress.done} / {jobProgress.total || "?"}
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: jobProgress.total ? `${(jobProgress.done / jobProgress.total) * 100}%` : "0%",
                    background: "var(--accent)",
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            )}
          </div>

          <div style={{
            padding: "16px 20px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-secondary)",
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ingest single document</p>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12 }}>
              Paste the Google Doc ID from the URL: drive.google.com/d/<strong>THIS_PART</strong>/edit
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={docId}
                onChange={e => setDocId(e.target.value)}
                placeholder="Google Doc ID"
                style={{
                  flex: 1, fontSize: 13, padding: "8px 12px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  background: "var(--bg)", color: "var(--fg)",
                }}
              />
              <button
                onClick={handleIngestOne}
                disabled={ingesting || !docId.trim()}
                className="btn btn-primary"
                style={{ opacity: (ingesting || !docId.trim()) ? 0.5 : 1 }}
              >
                Ingest
              </button>
            </div>
          </div>

          {ingestLog && (
            <pre style={{
              fontSize: 12, color: "var(--fg-muted)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{ingestLog}</pre>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="fade-in">
          <div style={{
            padding: "20px 24px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            maxWidth: 400,
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Change password</p>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              After changing, copy the new hash into <code style={{ background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>ADMIN_PASSWORD_HASH</code> in your <code style={{ background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>.env</code> and restart the backend.
            </p>
            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Current password", val: currentPw, set: setCurrentPw },
                { label: "New password", val: newPw, set: setNewPw },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input
                    type="password"
                    value={f.val}
                    onChange={e => f.set(e.target.value)}
                    style={{
                      width: "100%", fontSize: 13, padding: "8px 12px",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      background: "var(--bg)", color: "var(--fg)",
                    }}
                  />
                </div>
              ))}
              <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                Generate new hash
              </button>
            </form>
            {pwMsg && (
              <pre style={{
                marginTop: 16, fontSize: 12, color: "var(--fg-muted)",
                background: "var(--bg-secondary)", padding: "12px",
                borderRadius: "var(--radius-sm)", whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>{pwMsg}</pre>
            )}
          </div>
        </div>
      )}
    </main>
  );
}