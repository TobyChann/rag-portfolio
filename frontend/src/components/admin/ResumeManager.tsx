"use client";
import { useState, useEffect, useRef } from "react";
import { API_BASE as API } from "@/lib/api";

interface ResumeMeta {
  exists: boolean;
  filename?: string;
  size?: number;
  text_chars?: number;
  uploaded_at?: string | null;
}

// Upload / replace / remove the resume. The file is what visitors download from
// the home page; its text (contact details stripped) is what the chatbot reads.
export default function ResumeManager() {
  const [meta, setMeta] = useState<ResumeMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch(`${API}/admin/resume`, { credentials: "include" });
    if (res.ok) setMeta(await res.json());
  }

  async function upload(file: File) {
    setBusy(true); setMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/admin/resume`, { method: "POST", credentials: "include", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Upload failed");
      setMeta(data);
      setMsg("Uploaded. The chatbot uses the new version from its next answer.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Remove the resume? Visitors can no longer download it and the chatbot stops using it.")) return;
    setBusy(true); setMsg("");
    const res = await fetch(`${API}/admin/resume`, { method: "DELETE", credentials: "include" });
    setBusy(false);
    if (res.ok) { setMeta({ exists: false }); setMsg("Resume removed."); }
    else setMsg("Remove failed.");
  }

  return (
    <div style={{ padding: "16px 20px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)" }}>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Resume</p>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 16, lineHeight: 1.7 }}>
        Visitors download this file from the home page, and the chatbot reads its text on every
        question (your email, phone number and links are stripped first). Upload a PDF for the
        download — Word layouts can shift between machines. Uploading replaces the current version.
      </p>

      {meta?.exists ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
          <a href={`${API}/resume`} style={{ fontWeight: 600, color: "var(--fg)" }}>{meta.filename}</a>
          <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>
            {meta.size ? `${Math.round(meta.size / 1024)} KB · ` : ""}
            {meta.text_chars ? `${meta.text_chars.toLocaleString()} chars read · ` : ""}
            {meta.uploaded_at ? `uploaded ${new Date(meta.uploaded_at).toLocaleString()}` : ""}
          </span>
        </div>
      ) : meta && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic", marginBottom: 14 }}>No resume uploaded.</p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef} type="file" accept=".pdf,.docx" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
          {busy ? "Working…" : meta?.exists ? "Replace…" : "Upload…"}
        </button>
        {meta?.exists && (
          <button onClick={remove} disabled={busy} className="btn btn-ghost" style={{ color: "#DC2626" }}>Remove</button>
        )}
      </div>
      {msg && <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
