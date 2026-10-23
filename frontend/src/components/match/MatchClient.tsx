"use client";
import { useRef, useState } from "react";
import { ensureSession, streamMatch, SessionExpired, type MatchEvent } from "@/lib/api";
import { SAMPLE_JDS } from "@/lib/sample-jds";
import type { MatchResult } from "@/types";
import MatchResults from "./MatchResults";

const MAX = 8000;
const MIN = 80;

export default function MatchClient() {
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function run() {
    const text = jd.trim();
    if (text.length < MIN || running) return;
    setRunning(true); setError(""); setResult(null); setMatchId(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const onEvent = (ev: MatchEvent) => {
      if (ev.type === "requirements") {
        setResult({ company_guess: ev.company_guess, role_title: ev.role_title, requirements: ev.requirements, rows: [] });
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else if (ev.type === "row") {
        setResult(r => r && { ...r, rows: [...r.rows, ev.row] });
      } else if (ev.type === "summary") {
        const { type: _, ...summary } = ev;
        setResult(r => r && { ...r, summary });
      } else if (ev.type === "done") {
        setMatchId(ev.match_id);
        if (ev.match_id) window.history.replaceState(null, "", `/match/${ev.match_id}`);
      } else if (ev.type === "error") {
        setError(ev.detail);
      }
    };

    try {
      try {
        await streamMatch(text, await ensureSession(), onEvent, ctrl.signal);
      } catch (e) {
        if (!(e instanceof SessionExpired)) throw e;
        await streamMatch(text, await ensureSession(true), onEvent, ctrl.signal);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Something went wrong.");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      <form className="match-form" onSubmit={e => { e.preventDefault(); run(); }}>
        <label htmlFor="jd" className="section-label" style={{ display: "block", marginBottom: 8 }}>Job description</label>
        <textarea
          id="jd" value={jd} onChange={e => setJd(e.target.value.slice(0, MAX))} rows={10}
          placeholder="Paste a job description: responsibilities, requirements, nice-to-haves…"
          style={{
            width: "100%", fontSize: 14, lineHeight: 1.55, padding: "12px 14px", fontFamily: "inherit", resize: "vertical",
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--bg)", color: "var(--fg)",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 11.5, color: jd.length >= MAX ? "var(--danger)" : "var(--fg-subtle)" }}>
            {jd.length.toLocaleString()} / {MAX.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: "var(--fg-subtle)", marginLeft: 8 }}>Try an example:</span>
          {SAMPLE_JDS.map(s => (
            <button key={s.label} type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => setJd(s.jd)}>{s.label}</button>
          ))}
          <span style={{ flex: 1 }} />
          {running
            ? <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>Stop</button>
            : <button type="submit" className="btn btn-primary" disabled={jd.trim().length < MIN}>Match Toby to this role</button>}
        </div>
        {error && <p role="alert" style={{ fontSize: 13, color: "var(--danger)", marginTop: 10 }}>{error}</p>}
      </form>

      <div ref={resultsRef} style={{ marginTop: 32, scrollMarginTop: 72 }}>
        {result && <MatchResults result={result} pending={running} matchId={matchId} />}
      </div>
    </>
  );
}
