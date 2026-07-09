"use client";
import { useState, useEffect } from "react";

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
  const [busy, setBusy] = useState<Record<string, "running" | "done" | "error">>({});
  const [filter, setFilter] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/admin/drive-files`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setFiles(await res.json());
    } catch {
      setError("Couldn't load Drive files. Check the service account share and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function ingest(file: DriveFile) {
    setBusy(p => ({ ...p, [file.id]: "running" }));
    try {
      const res = await fetch(`${API}/admin/ingest/doc/${file.id}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setBusy(p => ({ ...p, [file.id]: "done" }));
    } catch {
      setBusy(p => ({ ...p, [file.id]: "error" }));
    }
  }

  const shown = files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

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
        Everything in your shared Drive folder. Pick a file to ingest it — no more copy-pasting IDs.
        Only Google Docs can be ingested; other types are listed for reference.
      </p>

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name…"
        style={{
          width: "100%", fontSize: 12, padding: "7px 12px", marginBottom: 10,
          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
          background: "var(--bg)", color: "var(--fg)", outline: "none",
        }}
      />

      {loading && <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading Drive files…</p>}
      {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>No files match.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {shown.map((f, i) => {
          const state = busy[f.id];
          return (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "10px 0",
              borderBottom: i < shown.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </p>
                {f.modifiedTime && (
                  <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>
                    Modified {new Date(f.modifiedTime).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span className={`tag ${f.ingestable ? "tag-green" : "tag-gray"}`}>{typeBadge(f.mimeType)}</span>
                {f.ingestable ? (
                  <button
                    onClick={() => ingest(f)}
                    disabled={state === "running"}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "5px 12px", opacity: state === "running" ? 0.6 : 1 }}
                  >
                    {state === "running" ? "Ingesting…" : state === "done" ? "Ingested ✓" : state === "error" ? "Retry" : "Ingest"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>not ingestable</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}