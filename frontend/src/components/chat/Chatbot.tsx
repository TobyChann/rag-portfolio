"use client";
import { useState, useRef, useEffect } from "react";
import { onboard, sendQuery, sendFeedback } from "@/lib/api";
import { Message, VisitorRole, Industry } from "@/types";

let _id = 0;
const uid = () => String(++_id);

const SUGGESTED = [
    "What databases have you worked with?",
    "Tell me about your ML experience",
    "What programming languages do you know?",
    "Describe your final year project",
];

const ROLES: { value: VisitorRole; label: string }[] = [
    { value: "recruiter", label: "Recruiter" },
    { value: "hiring_manager", label: "Hiring manager" },
    { value: "peer", label: "Peer / developer" },
    { value: "curious", label: "Just curious" },
];

const INDUSTRIES: Industry[] = ["Tech", "Finance", "Government", "Healthcare", "Other"];

/* ── inline styles using design tokens ── */
const S = {
    fab: {
        position: "fixed" as const, bottom: 24, right: 24,
        height: 40, borderRadius: 20,
        background: "var(--fg)", color: "var(--bg)",
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 7, padding: "0 16px",
        boxShadow: "0 2px 12px rgba(0,0,0,.18)",
        zIndex: 50, fontSize: 13, fontWeight: 500,
        transition: "background .15s, transform .1s",
        letterSpacing: "0.01em",
    },
    panel: {
        position: "fixed" as const, bottom: 24, right: 24,
        width: 320, background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 32px rgba(0,0,0,.10)",
        display: "flex", flexDirection: "column" as const,
        overflow: "hidden", zIndex: 50, maxHeight: 540,
    },
    header: {
        background: "var(--bg)", padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
    },
    msgBot: {
        background: "var(--bg-secondary)", color: "var(--fg)",
        fontSize: 12, padding: "8px 11px", borderRadius: "var(--radius-md)",
        maxWidth: "90%", lineHeight: 1.6, alignSelf: "flex-start",
    },
    msgUser: {
        background: "var(--accent)", color: "#fff",
        fontSize: 12, padding: "8px 11px", borderRadius: "var(--radius-md)",
        maxWidth: "90%", lineHeight: 1.6, alignSelf: "flex-end",
    },
};

export default function Chatbot() {
    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [role, setRole] = useState<VisitorRole | null>(null);
    const [industry, setIndustry] = useState<Industry | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    useEffect(() => {
        const stored = localStorage.getItem("portfolio_session");
        if (stored) setSessionId(stored);
    }, []);

    async function handleOnboard() {
        if (!role || !industry) return;
        try {
            const ref = new URLSearchParams(window.location.search).get("ref") || "";
            const { session_id } = await onboard(role, industry, ref);
            setSessionId(session_id);
            localStorage.setItem("portfolio_session", session_id);
            setMessages([{ id: uid(), role: "assistant", content: "Hi! Ask me anything about the candidate's skills, coursework, or projects." }]);
        } catch { setError("Something went wrong. Please try again."); }
    }

    async function handleSend(text?: string) {
        const q = text || input.trim();
        if (!q || !sessionId || loading) return;
        setInput(""); setError("");
        setMessages(p => [...p, { id: uid(), role: "user", content: q }]);
        setLoading(true);
        try {
            const res = await sendQuery(q, sessionId);
            setMessages(p => [...p, { id: uid(), role: "assistant", content: res.answer, queryId: res.query_id, feedback: null }]);
        } catch (e: any) {
            if (e.message?.includes("Session expired")) {
                // Redis lost the session (e.g. container restart) — drop back to onboarding
                setSessionId(null);
                setMessages([]);
                localStorage.removeItem("portfolio_session");
            } else {
                setError(e.message || "Something went wrong.");
            }
        } finally { setLoading(false); }
    }

    async function handleFeedback(msgId: string, queryId: string, val: 1 | -1) {
        setMessages(p => p.map(m => m.id === msgId ? { ...m, feedback: val } : m));
        await sendFeedback(queryId, val);
    }

    return (
        <>
            {!open && (
                <button
                    style={S.fab}
                    onClick={() => setOpen(true)}
                    aria-label="Open chat"
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Ask about my profile
                </button>
            )}

            {open && (
                <div style={S.panel}>
                    {/* Header */}
                    <div style={S.header}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Ask about my profile</p>
                            <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 1 }}>RAG-powered · gemini-2.5-flash</p>
                        </div>
                        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}>×</button>
                    </div>

                    {/* Onboarding */}
                    {!sessionId ? (
                        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                            <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Quick intro before we start:</p>

                            <div>
                                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Who are you?</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                    {ROLES.map(r => (
                                        <button key={r.value} onClick={() => setRole(r.value)} style={{
                                            fontSize: 12, padding: "7px 10px", borderRadius: "var(--radius-sm)",
                                            border: `1px solid ${role === r.value ? "var(--accent)" : "var(--border)"}`,
                                            background: role === r.value ? "var(--accent-light)" : "var(--bg)",
                                            color: role === r.value ? "var(--accent-text)" : "var(--fg-muted)",
                                            cursor: "pointer", transition: "all .15s",
                                        }}>{r.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Your industry?</p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {INDUSTRIES.map(ind => (
                                        <button key={ind} onClick={() => setIndustry(ind)} style={{
                                            fontSize: 11, padding: "4px 12px", borderRadius: 20,
                                            border: `1px solid ${industry === ind ? "var(--accent)" : "var(--border)"}`,
                                            background: industry === ind ? "var(--accent-light)" : "var(--bg)",
                                            color: industry === ind ? "var(--accent-text)" : "var(--fg-muted)",
                                            cursor: "pointer", transition: "all .15s",
                                        }}>{ind}</button>
                                    ))}
                                </div>
                            </div>

                            {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}

                            <button
                                onClick={handleOnboard}
                                disabled={!role || !industry}
                                className="btn btn-primary"
                                style={{ opacity: (!role || !industry) ? 0.4 : 1 }}
                            >
                                Start chatting →
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
                                {messages.map(msg => (
                                    <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                                        <div style={msg.role === "user" ? S.msgUser : S.msgBot}>{msg.content}</div>
                                        {msg.role === "assistant" && msg.queryId && (
                                            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                                {([1, -1] as const).map(v => (
                                                    <button key={v} onClick={() => handleFeedback(msg.id, msg.queryId!, v)}
                                                        style={{
                                                            background: "none", border: "none", cursor: "pointer", fontSize: 13,
                                                            opacity: msg.feedback === v ? 1 : 0.35,
                                                            transition: "opacity .15s",
                                                        }}
                                                    >{v === 1 ? "👍" : "👎"}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {loading && (
                                    <div style={S.msgBot}>
                                        <span style={{ opacity: .5 }}>Thinking…</span>
                                    </div>
                                )}
                                {error && <p style={{ fontSize: 12, color: "#DC2626", textAlign: "center" }}>{error}</p>}
                                <div ref={endRef} />
                            </div>

                            {/* Suggestions */}
                            {messages.length <= 1 && (
                                <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                                    {SUGGESTED.map(q => (
                                        <button key={q} onClick={() => handleSend(q)} style={{
                                            textAlign: "left", fontSize: 11, padding: "6px 10px",
                                            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                                            background: "var(--bg)", color: "var(--fg-muted)", cursor: "pointer",
                                            transition: "border-color .15s, color .15s",
                                        }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--fg)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-muted)"; }}
                                        >{q}</button>
                                    ))}
                                </div>
                            )}

                            {/* Input row */}
                            <div style={{ display: "flex", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleSend()}
                                    placeholder="Ask something…"
                                    disabled={loading}
                                    style={{
                                        flex: 1, fontSize: 12, padding: "7px 10px",
                                        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                                        background: "var(--bg)", color: "var(--fg)", outline: "none",
                                    }}
                                />
                                <button
                                    onClick={() => handleSend()}
                                    disabled={loading || !input.trim()}
                                    className="btn btn-primary"
                                    style={{ padding: "7px 12px", fontSize: 12, opacity: (loading || !input.trim()) ? 0.4 : 1 }}
                                >→</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
}
