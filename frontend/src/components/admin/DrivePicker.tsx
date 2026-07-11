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

function typeBadge(mime: string): string {
  if (mime.includes("document")) return "Doc";
  if (mime.includes("spreadsheet")) return "Sheet";
  if (mime.includes("presentation")) return "Slides";
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  return mime.split(".").pop()?.split("/").pop() || "File";
}

export default function DrivePicker() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState("");
  const [log, setLog] = useState("");
  const stopRef = useRef(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/drive-files`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      setFiles(await res.json());
    } catch (e: any) {
      setError(e.message === "404"
        ? "Endpoint /admin/drive-files not found — is it added to admin.py and the backend restarted?"
        : "Couldn't load Drive files. Check backend logs.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function ingestSelected() {
    const queue = files.filter(f => selected.has(f.id) && f.ingestable);
    if (queue.length === 0) return;
    setRunning(true); stopRef.current = false; setLog("");
    const done: string[] = [];
    for (const f of queue) {
      if (stopRef.current) {
        setLog(`Stopped. Ingested ${done.length}/${queue.length}:\n${done.join("\n")}`);
        break;
      }
      setCurrent(f.name);
      try {
        const res = await fetch(`${API}/admin/ingest/doc/${f.id}`, {
          method: "POST", credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        done.push(`${data.title}: ${data.chunk_count} chunks (${data.elapsed_ms}ms)`);
        setSelected(prev => { const n = new Set(prev); n.delete(f.id); return n; });
      } catch {
        done.push(`${f.name}: FAILED — check backend logs`);
      }
    }
    if (!stopRef.current) setLog(`Done. ${done.length} file(s):\n${done.join("\n")}`);
    setCurrent(""); setRunning(false);
  }

  const shown = files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  const selectableShown = shown.filter(f => f.ingestable);
  const selectedCount = files.filter(f => selected.has(f.id) && f.ingestable).length;

  return (
    <div style={{
      padding: "16px 20px", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", background: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>Drive files</p>
        <button onClick={load} className="btn btn-ghost" style={{ fontSize: 12 }}>Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12, lineHeight: 1.7 }}>
        Tick the files you want, then ingest them one by one (sequential — plays nice
        with the Gemini rate limit). Only Google Docs are ingestable; other types are
        listed for reference.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name…"
          style={{
            flex: 1, minWidth: 160, fontSize: 12, padding: "7px 12px",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            background: "var(--bg)", color: "var(--fg)", outline: "none",
          }}
        />
        <button
          onClick={() => setSelected(new Set(selectableShown.map(f => f.id)))}
          disabled={running}
          className="btn btn-ghost" style={{ fontSize: 12 }}
        >Select all</button>
        {running ? (
          <button onClick={() => { stopRef.current = true; }} className="btn btn-secondary" style={{ fontSize: 12 }}>
            Stop after current
          </button>
        ) : (
          <button
            onClick={ingestSelected}
            disabled={selectedCount === 0}
            className="btn btn-primary"
            style={{ fontSize: 12, opacity: selectedCount === 0 ? 0.5 : 1 }}
          >
            Ingest selected ({selectedCount})
          </button>
        )}
      </div>

      {running && current && (
        <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
          Ingesting: <strong>{current}</strong>…
        </p>
      )}
      {log && (
        <pre style={{
          fontSize: 12, color: "var(--fg-muted)", background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
          padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 10,
        }}>{log}</pre>
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