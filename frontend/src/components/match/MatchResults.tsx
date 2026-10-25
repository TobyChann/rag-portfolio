"use client";
import { useState } from "react";
import { API_BASE, ensureSession, openChat, updateVisitor } from "@/lib/api";
import type { MatchEvidence, MatchResult, MatchRow, Verdict } from "@/types";

const VERDICT_LABEL: Record<Verdict, string> = { strong: "Strong", partial: "Partial", gap: "Gap" };
const GAP_NOTE = "I haven't documented this in my notes yet.";

function evidenceChips(evidence: MatchEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter(e => {
    const key = e.kind === "note" ? `note:${e.google_doc_id}` : e.kind === "resume" ? "resume" : `${e.kind}:${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Chip({ e }: { e: MatchEvidence }) {
  if (e.kind === "resume") {
    return <a className="ev-chip" href={`${API_BASE}/resume`}>Resume</a>;
  }
  if (e.kind === "note") {
    return <a className="ev-chip" href={`/notes/${e.google_doc_id}`} title={e.heading ? `Section: ${e.heading}` : undefined}>{e.title}</a>;
  }
  return <span className="ev-chip ev-chip-plain">{e.kind === "skill" ? "Skill: " : "Course: "}{e.name}</span>;
}

function Row({ req, row, index }: { req: MatchResult["requirements"][number]; row?: MatchRow; index: number }) {
  return (
    <div className="match-row fade-in" style={{ animationDelay: `${index * 60}ms` }} role="row">
      <div role="cell">
        <span style={{ fontWeight: 600 }}>{req.text}</span>
        <span className="tag tag-gray" style={{ fontSize: 10, marginLeft: 6 }}>{req.must_have ? "must-have" : "nice-to-have"}</span>
      </div>
      <div role="cell">
        {row ? <span className={`verdict verdict-${row.verdict}`}>{VERDICT_LABEL[row.verdict]}</span>
             : <span className="shimmer" style={{ fontSize: 12 }}>Grading…</span>}
      </div>
      <div role="cell" style={{ minWidth: 0 }}>
        {row && (
          <>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>
              {row.verdict === "gap" ? <><strong style={{ color: "var(--fg)" }}>{GAP_NOTE}</strong> {row.rationale}</> : row.rationale}
            </p>
            {row.evidence.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {evidenceChips(row.evidence).map((e, i) => <Chip key={i} e={e} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function MatchResults({ result, pending, matchId }: {
  result: MatchResult;
  pending: boolean;
  matchId?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const rowById = Object.fromEntries(result.rows.map(r => [r.id, r]));
  const counts = result.summary?.counts;
  const total = counts ? counts.strong + counts.partial + counts.gap : 0;
  const role = result.role_title || "this role";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/match/${matchId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  async function askAboutRole() {
    const context = [
      `${result.role_title ?? "Role"}${result.company_guess ? ` at ${result.company_guess}` : ""}.`,
      "Requirements and how Toby's evidence graded: " +
        result.rows.map(r => `${r.text} (${r.must_have ? "must-have" : "nice-to-have"}; ${r.verdict})`).join("; "),
    ].join(" ").slice(0, 1500);
    try {
      await updateVisitor(await ensureSession(), { role_context: context });
    } catch { /* the chat still works without the role context */ }
    openChat(`How well do you fit the ${role} role?`);
  }

  return (
    <section aria-labelledby="match-title" className="match-results">
      <div style={{ marginBottom: 16 }}>
        <h2 id="match-title" style={{ fontSize: 20, fontWeight: 700 }}>
          {result.role_title || "Job match"}
          {result.company_guess && <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}> · {result.company_guess}</span>}
        </h2>
        {counts && total > 0 && (
          <>
            <div className="verdict-bar" role="img"
                 aria-label={`${counts.strong} strong, ${counts.partial} partial, ${counts.gap} ${counts.gap === 1 ? "gap" : "gaps"} out of ${total} requirements`}>
              {(["strong", "partial", "gap"] as Verdict[]).map(v => counts[v] > 0 && (
                <span key={v} className={`verdict-seg verdict-${v}`} style={{ flexGrow: counts[v] }}>{counts[v]} {VERDICT_LABEL[v].toLowerCase()}</span>
              ))}
            </div>
            {result.summary?.fits && <p style={{ fontSize: 14, marginTop: 10 }}><strong>Where I fit:</strong> {result.summary.fits}</p>}
            {result.summary?.grow && <p style={{ fontSize: 14, marginTop: 4 }}><strong>Where I&apos;d grow:</strong> {result.summary.grow}</p>}
          </>
        )}
      </div>

      <div role="table" aria-label="Requirements">
        <div className="match-row match-head" role="row">
          <div role="columnheader">Requirement</div><div role="columnheader">Fit</div><div role="columnheader">Evidence from my notes and resume</div>
        </div>
        {result.requirements.map((req, i) => <Row key={req.id} req={req} row={rowById[req.id]} index={i} />)}
      </div>

      {matchId && !pending && (
        <div className="match-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          <button onClick={askAboutRole} className="btn btn-primary">Ask me about this role</button>
          <button onClick={copyLink} className="btn btn-secondary">{copied ? "Link copied" : "Copy link"}</button>
          <button onClick={() => window.print()} className="btn btn-secondary">Save as PDF</button>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 14 }}>
        Graded by gpt-4o-mini, using only evidence from my notes, skills board and resume. Where the evidence is thin, it says so.
      </p>
    </section>
  );
}
