"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { nanoid } from "nanoid";
import { API_BASE as API, SESSION_KEY, ensureSession as startSession, readStored as read, writeStored as store,
         streamQuery, sendFeedback, updateVisitor, clearConversation, SessionExpired } from "@/lib/api";
import { Message, Trace } from "@/types";

interface DocInfo { name: string; summary: string; skills: string[]; course: string; }

const PROFILED_KEY = "portfolio_profiled";
const MAX_STORED = 50;

const SUGGESTED = [
  "What has Toby studied in Accounting?",
  "What has Toby studied in Finance?",
  "What has Toby studied in Information Systems?",
  "What has Toby built?",
  "What work experience does Toby have?",
];

const ROLES = [
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "peer", label: "Peer / developer" },
  { value: "curious", label: "Just curious" },
];

const INDUSTRIES = ["Tech", "Finance", "Government", "Healthcare", "Other"];

// The model cites note excerpts as [n]; turning those into #cite-n links lets
// the Markdown renderer hand them to a button instead of printing brackets.
const withCiteLinks = (md: string) => md.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#cite-$1)");

const chip = (active = false): React.CSSProperties => ({
  fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  background: active ? "var(--accent-light)" : "var(--bg)",
  color: active ? "var(--accent-text)" : "var(--fg-muted)",
  transition: "border-color .15s, color .15s",
});

function HowAnswered({ trace }: { trace: Trace }) {
  const max = Math.max(...trace.retrieval.map(r => r.fused_score), 0.0001);
  const facts = [
    trace.cache_hit ? "cached answer" : null,
    `${(trace.response_ms / 1000).toFixed(1)} s`,
    trace.model,
    trace.mode && `${trace.mode} retrieval`,
    trace.tokens_in != null && `${trace.tokens_in} → ${trace.tokens_out} tokens`,
  ].filter(Boolean);
  return (
    <details className="how-answered">
      <summary>How this was answered</summary>
      {trace.rewritten_question && (
        <p style={{ margin: "6px 0" }}>Searched as: <em>&ldquo;{trace.rewritten_question}&rdquo;</em></p>
      )}
      <p className="mono" style={{ margin: "6px 0", color: "var(--fg-subtle)" }}>{facts.join(" · ")}</p>
      {trace.retrieval.length > 0 && (
        <table>
          <thead><tr><th>#</th><th>Excerpt</th><th>Score</th><th title="Rank in vector search">Vec</th><th title="Rank in keyword search">Kw</th></tr></thead>
          <tbody>
            {trace.retrieval.map((r, i) => (
              <tr key={r.chunk_id ?? i}>
                <td className="mono">{i + 1}</td>
                <td><span className="trace-doc">{r.doc_title.replace(/^Notes_/, "").replace(/_/g, " ")}</span>{r.heading && ` · ${r.heading.replace(/^#+\s*/, "")}`}</td>
                <td><span className="trace-bar"><span style={{ width: `${(r.fused_score / max) * 100}%` }} /></span><span className="mono">{r.fused_score}</span></td>
                <td className="mono">{r.dense_rank ?? "–"}</td>
                <td className="mono">{r.lexical_rank ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

export default function ChatPanel({ ask, onClose }: {
  ask: { q: string; n: number; docId?: string } | null;
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [docMap, setDocMap] = useState<Record<string, DocInfo>>({});
  const [openSource, setOpenSource] = useState<{ msgId: string; docId: string; heading?: string; chunkIndex?: number | null } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [answerModel, setAnswerModel] = useState("");
  const [profileStep, setProfileStep] = useState<"role" | "industry" | "done">(
    () => (read(PROFILED_KEY) ? "done" : "role"));
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handledAsk = useRef(0);
  const busy = streamingId !== null;

  // The session is created silently: no questions before the first answer.
  const ensureSession = useCallback(async (fresh = false) => {
    const sid = await startSession(fresh);
    setSessionId(sid);
    return sid;
  }, []);

  useEffect(() => {
    const sid = read(SESSION_KEY);
    if (!sid) return;
    setSessionId(sid);
    try { setMessages(JSON.parse(read(`portfolio_chat:${sid}`) || "[]")); } catch { /* corrupt history */ }
  }, []);

  useEffect(() => {
    if (!sessionId || busy) return;
    store(`portfolio_chat:${sessionId}`, JSON.stringify(messages.slice(-MAX_STORED)));
  }, [messages, sessionId, busy]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; abortRef.current?.abort(); };
  }, []);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Note map, so answer sources can show a note's summary. Public endpoint.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/portfolio`);
        if (!res.ok) return;
        const data = await res.json();
        const folderName: Record<string, string> = {};
        (data.folders || []).forEach((f: any) => { folderName[f.id] = f.name; });
        const map: Record<string, DocInfo> = {};
        (data.docs || []).forEach((d: any) => {
          map[d.google_doc_id] = { name: d.display_name, summary: d.summary, skills: d.skills || [],
                                   course: d.folder_id ? folderName[d.folder_id] ?? "" : "" };
        });
        setDocMap(map);
      } catch { /* sources just won't link */ }
    })();
    fetch(`${API}/meta`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.answer_model) setAnswerModel(d.answer_model); })
      .catch(() => {});
  }, []);

  const send = useCallback(async (text?: string, docId?: string) => {
    const q = (text ?? input).trim();
    if (!q || streamingId) return;
    setInput(""); setError("");
    const id = nanoid();
    setMessages(p => [...p, { id: nanoid(), role: "user", content: q },
                             { id, role: "assistant", content: "", feedback: null, sources: [] }]);
    setStreamingId(id);
    const patch = (fn: (m: Message) => Message) => setMessages(p => p.map(m => m.id === id ? fn(m) : m));
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const run = (sid: string) => streamQuery(q, sid, ev => {
      if (ev.type === "sources") patch(m => ({ ...m, sources: ev.sources, citations: ev.citations }));
      else if (ev.type === "delta") patch(m => ({ ...m, content: m.content + ev.text }));
      else if (ev.type === "trace") { const { type: _, ...trace } = ev; patch(m => ({ ...m, trace })); }
      else if (ev.type === "followups") patch(m => ({ ...m, followups: ev.questions }));
      else if (ev.type === "done") patch(m => ({ ...m, queryId: ev.query_id ?? undefined }));
      else if (ev.type === "error") setError(ev.detail);
    }, ctrl.signal, docId);

    try {
      try {
        await run(await ensureSession());
      } catch (e) {
        if (!(e instanceof SessionExpired)) throw e;
        await run(await ensureSession(true));   // Redis dropped the session; start a new one
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Something went wrong.");
    } finally {
      setMessages(p => p.filter(m => m.id !== id || m.content));
      setStreamingId(null);
      abortRef.current = null;
    }
  }, [input, streamingId, ensureSession]);

  useEffect(() => {
    if (ask && ask.n !== handledAsk.current) {
      handledAsk.current = ask.n;
      send(ask.q, ask.docId);
    }
  }, [ask, send]);

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError("");
    setOpenSource(null);
    if (sessionId) {
      store(`portfolio_chat:${sessionId}`, null);
      clearConversation(sessionId).catch(() => {});
    }
    inputRef.current?.focus();
  }

  async function handleFeedback(msgId: string, queryId: string, val: 1 | -1) {
    setMessages(p => p.map(m => m.id === msgId ? { ...m, feedback: val } : m));
    await sendFeedback(queryId, val);
  }

  async function copy(msg: Message) {
    try {
      await navigator.clipboard.writeText(msg.content.replace(/\[(\d{1,2})\]/g, ""));
      setCopied(msg.id);
      setTimeout(() => setCopied(c => (c === msg.id ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  }

  function profile(fields: { role?: string; industry?: string }, next: "industry" | "done") {
    if (sessionId) updateVisitor(sessionId, fields).catch(() => {});
    setProfileStep(next);
    if (next === "done") store(PROFILED_KEY, "1");
  }

  const firstAnswerId = messages.find(m => m.role === "assistant" && m.content && m.id !== streamingId)?.id;
  const lastAnswerId = [...messages].reverse().find(m => m.role === "assistant")?.id;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 59, background: "var(--overlay)" }} className="fade-in" aria-hidden="true" />
      <div ref={panelRef} className="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-title">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="chat-title" style={{ fontSize: 14, fontWeight: 600 }}>Ask about Toby</h2>
            <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 1 }}>
              Answers from his study notes{answerModel && <> · <span className="mono">{answerModel}</span></>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {messages.length > 0 && (
              <button onClick={newChat} className="icon-btn" aria-label="New chat" title="New chat">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            )}
            <button onClick={onClose} className="icon-btn" aria-label="Close chat">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }} aria-live="polite">
          {messages.length === 0 && (
            <>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                Ask anything about Toby&apos;s coursework, projects or experience. Answers cite the notes they came from, and you can ask follow-ups.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => send(q)} style={{
                    textAlign: "left", fontSize: 12.5, padding: "9px 12px", fontFamily: "inherit",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    background: "var(--bg)", color: "var(--fg-muted)", cursor: "pointer",
                  }}>{q}</button>
                ))}
              </div>
            </>
          )}

          {messages.map(msg => {
            const known = (msg.sources || []).filter(s => docMap[s.google_doc_id]);
            const isOpen = (docId: string) => openSource?.msgId === msg.id && openSource.docId === docId;
            const cite = (n: number) => {
              const c = msg.citations?.find(x => x.n === n);
              if (c) setOpenSource(o => (o?.msgId === msg.id && o.docId === c.google_doc_id && o.heading === c.heading
                ? null : { msgId: msg.id, docId: c.google_doc_id, heading: c.heading, chunkIndex: c.chunk_index }));
            };
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "user" ? (
                  <div style={{ background: "var(--accent-strong)", color: "var(--on-accent)", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-md)", maxWidth: "88%", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {msg.content}
                  </div>
                ) : (
                  <div className="md md-sm" style={{ background: "var(--bg-secondary)", color: "var(--fg)", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-md)", maxWidth: "94%", lineHeight: 1.6 }}>
                    {msg.content
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          a: ({ href, children }) => {
                            const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : NaN;
                            if (!Number.isNaN(n) && msg.citations?.some(c => c.n === n)) {
                              return <button type="button" className="cite" onClick={() => cite(n)} aria-label={`Source ${n}`}>{n}</button>;
                            }
                            if (!Number.isNaN(n)) return null;   // a number the context didn't have
                            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                          },
                        }}>{withCiteLinks(msg.content)}</ReactMarkdown>
                      : <span className="shimmer">Thinking…</span>}
                  </div>
                )}

                {msg.role === "assistant" && known.length > 0 && (
                  <div style={{ maxWidth: "94%", marginTop: 6 }}>
                    <p style={{ fontSize: 10, color: "var(--fg-subtle)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>From Toby&apos;s notes</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {known.map(s => (
                        <button key={s.google_doc_id} aria-expanded={isOpen(s.google_doc_id)}
                                onClick={() => setOpenSource(isOpen(s.google_doc_id) ? null : { msgId: msg.id, docId: s.google_doc_id })}
                                style={{ ...chip(isOpen(s.google_doc_id)), fontSize: 11, padding: "3px 9px" }}>
                          {docMap[s.google_doc_id].name}
                        </button>
                      ))}
                    </div>
                    {openSource?.msgId === msg.id && docMap[openSource.docId] && (() => {
                      const info = docMap[openSource.docId];
                      return (
                        <div style={{ marginTop: 6, padding: "9px 11px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>{info.name}</p>
                          {info.course && <p style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 1 }}>{info.course}</p>}
                          {openSource.heading && (
                            <p style={{ fontSize: 11, color: "var(--accent-text)", marginTop: 4 }}>Cited section: {openSource.heading.replace(/^#+\s*/, "")}</p>
                          )}
                          <p style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, marginTop: 5 }}>
                            {info.summary || <span style={{ fontStyle: "italic" }}>No summary yet.</span>}
                          </p>
                          {info.skills.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                              {info.skills.map(sk => <span key={sk} className="tag tag-blue" style={{ fontSize: 10 }}>{sk}</span>)}
                            </div>
                          )}
                          <a href={`/notes/${openSource.docId}${openSource.heading && openSource.chunkIndex != null ? `#chunk-${openSource.chunkIndex}` : ""}`}
                             style={{ display: "inline-block", fontSize: 12, marginTop: 8, color: "var(--accent-text)" }}>
                            Open note →
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {msg.role === "assistant" && msg.content && msg.id !== streamingId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2 }}>
                    <button onClick={() => copy(msg)} className="icon-btn" aria-label="Copy answer" title="Copy">
                      {copied === msg.id
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>}
                    </button>
                    {msg.queryId && ([1, -1] as const).map(v => (
                      <button key={v} onClick={() => handleFeedback(msg.id, msg.queryId!, v)}
                              className="icon-btn" aria-label={v === 1 ? "Helpful" : "Not helpful"} aria-pressed={msg.feedback === v}
                              style={{ fontSize: 13, opacity: msg.feedback === v ? 1 : 0.45 }}>
                        {v === 1 ? "👍" : "👎"}
                      </button>
                    ))}
                  </div>
                )}

                {msg.role === "assistant" && msg.trace && msg.id !== streamingId && (
                  <div style={{ maxWidth: "94%", width: "100%" }}><HowAnswered trace={msg.trace} /></div>
                )}

                {msg.id === lastAnswerId && !busy && (msg.followups?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8, maxWidth: "94%" }}>
                    {msg.followups!.map(q => (
                      <button key={q} onClick={() => send(q)} style={{ ...chip(), textAlign: "left", borderRadius: "var(--radius-sm)" }}>{q}</button>
                    ))}
                  </div>
                )}

                {msg.id === firstAnswerId && profileStep !== "done" && (
                  <div style={{ marginTop: 10, padding: "10px 12px", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)", maxWidth: "94%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600 }}>{profileStep === "role" ? "Who's asking?" : "Which industry?"}</p>
                      <button onClick={() => profile({}, "done")} className="btn-ghost" style={{ fontSize: 11, border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 6px", borderRadius: 4 }}>Skip</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {profileStep === "role"
                        ? ROLES.map(r => <button key={r.value} style={chip()} onClick={() => profile({ role: r.value }, "industry")}>{r.label}</button>)
                        : INDUSTRIES.map(i => <button key={i} style={chip()} onClick={() => profile({ industry: i }, "done")}>{i}</button>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {error && <p role="alert" style={{ fontSize: 12, color: "var(--danger)", textAlign: "center" }}>{error}</p>}
          <div ref={endRef} />
        </div>

        <form onSubmit={e => { e.preventDefault(); send(); }}
              style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
          <label htmlFor="chat-input" className="sr-only">Your question</label>
          <input
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={messages.length ? "Ask a follow-up…" : "Ask something…"}
            maxLength={500}
            style={{
              flex: 1, minWidth: 0, fontSize: 14, padding: "10px 12px", fontFamily: "inherit",
              border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
              background: "var(--bg)", color: "var(--fg)",
            }}
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-secondary" style={{ padding: "8px 14px" }}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="btn btn-primary" aria-label="Send" style={{ padding: "8px 14px" }}>
              →
            </button>
          )}
        </form>
      </div>
    </>
  );
}
