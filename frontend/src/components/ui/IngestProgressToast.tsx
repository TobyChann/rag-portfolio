"use client";
import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const STORAGE_KEY = "ingest_job_id";

export default function IngestProgressToast() {
  const [job, setJob] = useState<{ status: string; done: number; total: number; current: string; error?: string } | null>(null);
  const [minimised, setMinimised] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling(jobId: string) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/admin/ingest/status/${jobId}`, { credentials: "include" });
        if (!res.ok) { stop(); return; }
        const data = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") stop();
      } catch { stop(); }
    }, 2000);
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function dismiss() {
    stop();
    setJob(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    const jobId = localStorage.getItem(STORAGE_KEY);
    if (!jobId) return;
    startPolling(jobId);
    return stop;
  }, []);

  // Listen for new job starts from admin page
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) startPolling(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!job || (job.status === "done" && minimised)) return null;

  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const isDone = job.status === "done";
  const isErr = job.status === "error";

  return (
    <div style={{
      position: "fixed", top: 64, right: 16, zIndex: 60,
      width: 280, background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      boxShadow: "0 4px 20px rgba(0,0,0,.1)",
      overflow: "hidden",
      transition: "box-shadow .2s",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",
        background: isDone ? "#F0FDF4" : isErr ? "#FEF2F2" : "var(--bg-secondary)",
        borderBottom: minimised ? "none" : "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isDone && !isErr && (
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse 1.4s ease-in-out infinite",
            }} />
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: isDone ? "#15803D" : isErr ? "#DC2626" : "var(--fg)" }}>
            {isDone ? "Ingestion complete" : isErr ? "Ingestion failed" : "Ingesting documents…"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setMinimised(m => !m)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: "var(--fg-muted)", padding: "0 4px", lineHeight: 1,
          }}>{minimised ? "▴" : "▾"}</button>
          {(isDone || isErr) && (
            <button onClick={dismiss} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 16, color: "var(--fg-muted)", padding: "0 4px", lineHeight: 1,
            }}>×</button>
          )}
        </div>
      </div>

      {!minimised && (
        <div style={{ padding: "10px 12px" }}>
          {isErr ? (
            <p style={{ fontSize: 12, color: "#DC2626" }}>{job.error || "Unknown error"}</p>
          ) : (
            <>
              {job.current && !isDone && (
                <p style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.current}
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                  {isDone ? `${job.done} documents` : `${job.done} / ${job.total || "?"}`}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: isDone ? "#15803D" : "var(--fg)" }}>
                  {isDone ? "Done" : `${pct}%`}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: isDone ? "100%" : `${pct}%`,
                  background: isDone ? "#22C55E" : "var(--accent)",
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}
