"use client";
import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  ingestable: boolean;
}

interface BatchJob {
  status: "idle" | "running" | "done" | "cancelled" | "error";
  done?: number;
  total?: number;
  current?: string;
  error?: string | null;
  results?: { title: string; chunks: number; ms: number; parse_status: string }[];
}

function typeBadge(mime: string): string {
  if (mime.includes("document")) return "Doc";
  if (mime.includes("spreadsheet")) return "Sheet";
  if (mime.includes("presentation")) return "Slides";
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  return mime.split(".").pop()?.split("/").pop() || "File";
}

function jobLog(job: BatchJob): string {
  const lines = (job.results || []).map(r =>
    `${r.title}: ${r.chunks} chunks (${r.ms}ms)` +
    (r.parse_status === "fallback" ? "  ⚠ images NOT parsed — re-ingest later" : "")
  );
  if (job.status === "done") return `Done. ${job.done} file(s):\n${lines.join("\n")}`;
  if (job.status === "cancelled") return `Cancelled after ${job.done} file(s):\n${lines.join("\n")}`;
  if (job.status === "error") return `Error: ${job.error}\nCompleted before failure:\n${lines.join("\n")}`;
  return "";
}

export default function DrivePicker() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<BatchJob>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    // Re-attach to a batch that kept running while the tab was closed
    checkActive(true);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/drive-files`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      setFiles(await res.json());
    } catch {
      setError("Couldn't load Drive files. Check backend logs.");
    } finally {
      setLoading(false);
    }
  }

  async function checkActive(startPollingIfRunning: boolean) {
    try {
      const res = await fetch(`${API}/admin/ingest/active`, { credentials: "include" });
      if (!res.ok) return;
      const j: BatchJob = await res.json();
      setJob(j);
      if (j.status === "running" && startPollingIfRunning) startPolling();
    } catch { /* non-fatal */ }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/admin/ingest/active`, { credentials: "include" });
        const j: BatchJob = await res.json();
        setJob(j);
        if (j.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 2000);
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function startBatch() {
    const queue = files.filter(f => selected.has(f.id) && f.ingestable)
                       .map(f => ({ id: f.id, name: f.name }));
    if (queue.length === 0) return;
    setError("");
    try {
      const res = await fetch(`${API}/admin/ingest/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ docs: queue }),
      });
      if (res.status === 409) { setError("A batch is already running."); checkActive(true); return; }
      if (!res.ok) throw new Error(await res.text());
      setSelected(new Set());
      setJob({ status: "running", done: 0, total: queue.length, current: "", results: [] });
      startPolling();
    } catch {
      setError("Couldn't start the batch. Check backend logs.");
    }
  }

  async function cancelBatch() {
    try {
      await fetch(`${API}/admin/ingest/cancel`, { method: "POST", credentials: "include" });
      // polling picks up the 'cancelled' state
    } catch { /* best-effort */ }
  }

  const running = job.status === "running";
  const shown = files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  const selectableShown = shown.filter(f => f.ingestable);
  const notesShown = selectableShown.filter(f => f.name.startsWith("Notes_"));
  const selectedCount = files.filter(f => selected.has(f.id) && f.ingestable).length;
  const finishedLog = jobLog(job);

  return (
    <div style={{
      padding: "16px 20px", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", background: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>Ingest from Drive</p>
        <button onClick={load} className="btn btn-ghost" style={{ fontSize: 12 }}>Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12, lineHeight: 1.7 }}>
        Tick files and start a batch — it runs on the backend (paced for the Gemini
        rate limit), so you can close this tab and progress will still be here when
        you come back. "Select Notes_" is the full rebuild. New Drive files only
        enter the corpus from here; sync never inserts them.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name…"
          style={{
            flex: 1, minWidth: 140, fontSize: 12, padding: "7px 12px",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            background: "var(--bg)", color: "var(--fg)", outline: "none",
          }}
        />
        <button
          onClick={() => setSelected(new Set(notesShown.map(f => f.id)))}
          disabled={running}
          className="btn btn-ghost" style={{ fontSize: 12 }}
        >Select Notes_ ({notesShown.length})</button>
        <button
          onClick={() => setSelected(new Set(selectableShown.map(f => f.id)))}
          disabled={running}
          className="btn btn-ghost" style={{ fontSize: 12 }}
        >Select all</button>
        <button
          onClick={() => setSelected(new Set())}
          disabled={running || selectedCount === 0}
          className="btn btn-ghost" style={{ fontSize: 12 }}
        >Clear</button>
        {running ? (
          <button onClick={cancelBatch} className="btn btn-secondary" style={{ fontSize: 12 }}>
            Cancel after current
          </button>
        ) : (
          <button
            onClick={startBatch}
            disabled={selectedCount === 0}
            className="btn btn-primary"
            style={{ fontSize: 12, opacity: selectedCount === 0 ? 0.5 : 1 }}
          >
            Ingest selected ({selectedCount})
          </button>
        )}
      </div>

      {running && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              {job.current ? <>Ingesting: <strong>{job.current}</strong>…</> : "Starting…"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{job.done ?? 0} / {job.total ?? "?"}</span>
          </div>
          <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: job.total ? `${((job.done ?? 0) / job.total) * 100}%` : "5%",
              background: "var(--accent)",
              borderRadius: 3,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}
      {!running && finishedLog && (
        <pre style={{
          fontSize: 12, color: "var(--fg-muted)", background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
          padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 10,
        }}>{finishedLog}</pre>
      )}

      {loading && <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading Drive files…</p>}
      {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No files match.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {shown.map((f, i) => (
          <label key={f.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
            borderBottom: i < shown.length - 1 ? "1px solid var(--border)" : "none",
            cursor: f.ingestable ? "pointer" : "default",
            opacity: f.ingestable ? 1 : 0.55,
          }}>
            <input
              type="checkbox"
              disabled={!f.ingestable || running}
              checked={selected.has(f.id)}
              onChange={() => toggle(f.id)}
              style={{ flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </p>
              {f.modifiedTime && (
                <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>
                  Modified {new Date(f.modifiedTime).toLocaleDateString()}
                </p>
              )}
            </div>
            <span className={`tag ${f.ingestable ? "tag-green" : "tag-gray"}`} style={{ flexShrink: 0 }}>
              {typeBadge(f.mimeType)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}