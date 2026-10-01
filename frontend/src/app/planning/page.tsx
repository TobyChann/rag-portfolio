"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { API_BASE as API } from "@/lib/api";

interface ChatMeta {
  id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
}

export default function PlanningPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Owner-only page
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => { if (r.ok) { setAuthed(true); loadChats(); } else router.push("/login"); })
      .catch(() => router.push("/login"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function loadChats() {
    try {
      const res = await fetch(`${API}/planning/chats`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const list = await res.json();
      setChats(list);
      if (list.length > 0) selectChat(list[0].id);
    } catch {
      setError("Couldn't load chats.");
    }
  }

  async function selectChat(id: string) {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`${API}/planning/chats/${id}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setMessages(await res.json());
    } catch {
      setError("Couldn't load this chat.");
    }
  }

  async function newChat() {
    try {
      const res = await fetch(`${API}/planning/chats`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      const chat = await res.json();
      setChats(c => [chat, ...c]);
      setActiveId(chat.id);
      setMessages([]);
    } catch {
      setError("Couldn't create a chat.");
    }
  }

  function startRename(c: ChatMeta) {
    setRenamingId(c.id);
    setRenameDraft(c.title);
  }

  async function commitRename(id: string) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const prev = chats;
    setChats(c => c.map(x => x.id === id ? { ...x, title } : x));   // optimistic
    try {
      const res = await fetch(`${API}/planning/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setChats(c => c.map(x => x.id === id ? updated : x));
    } catch {
      setChats(prev);   // roll back on failure
      setError("Couldn't rename the chat.");
    }
  }

  async function deleteChat(id: string) {
    const prev = chats;
    setChats(c => c.filter(x => x.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
    try {
      const res = await fetch(`${API}/planning/chats/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
    } catch {
      setChats(prev);
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;

    // Create a thread implicitly if none exists
    let chatId = activeId;
    if (!chatId) {
      const res = await fetch(`${API}/planning/chats`, { method: "POST", credentials: "include" });
      if (!res.ok) { setError("Couldn't create a chat."); return; }
      const chat = await res.json();
      setChats(c => [chat, ...c]);
      setActiveId(chat.id);
      chatId = chat.id;
    }

    setSending(true); setError(""); setInput("");
    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    setMessages(m => [...m, { id: tempId, role: "user", content, created_at: null }]);

    try {
      const res = await fetch(`${API}/planning/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      const { user, assistant, chat } = await res.json();
      setMessages(m => [...m.filter(x => x.id !== tempId), user, assistant]);
      setChats(c => c.map(x => x.id === chat.id ? chat : x));
    } catch {
      setMessages(m => m.filter(x => x.id !== tempId));
      setInput(content);   // give the text back so nothing is lost
      setError("Message failed to send — try again.");
    } finally {
      setSending(false);
    }
  }

  if (!authed) return null;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 24px", display: "flex", gap: 20, minHeight: "calc(100vh - 120px)" }}>

      {/* Thread sidebar */}
      <aside style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={newChat} className="btn btn-primary" style={{ fontSize: 12, justifyContent: "center" }}>
          + New chat
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {chats.map(c => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                padding: "8px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                background: activeId === c.id ? "var(--accent-light)" : "transparent",
                border: `1px solid ${activeId === c.id ? "var(--accent)" : "transparent"}`,
              }}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitRename(c.id);
                    else if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => commitRename(c.id)}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 12, padding: "2px 6px",
                    border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
                    background: "var(--bg)", color: "var(--fg)", outline: "none",
                  }}
                />
              ) : (
                <span
                  onDoubleClick={e => { e.stopPropagation(); startRename(c); }}
                  title="Double-click to rename"
                  style={{
                    flex: 1, fontSize: 12, fontWeight: activeId === c.id ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {c.title}
                </span>
              )}
              {renamingId !== c.id && (
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); startRename(c); }}
                    title="Rename chat"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", fontSize: 12, lineHeight: 1, padding: 0 }}
                  >✎</button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                    title="Delete chat"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", fontSize: 13, lineHeight: 1, padding: 0 }}
                  >×</button>
                </span>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-subtle)", lineHeight: 1.6, marginTop: "auto" }}>
          Every chat reads your live profile and skill inventory. Threads don't share transcripts.
        </p>
      </aside>

      {/* Conversation */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
          {messages.length === 0 && !sending && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 400 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Career planning</p>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7 }}>
                Ask what to learn next, whether a plan is realistic, or what your notes say
                you're still missing for your goal. Keep your Profile tab up to date first —
                that's what this chat knows you by.
              </p>
            </div>
          )}
          {messages.map(m => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? "var(--accent)" : "var(--bg-secondary)",
                color: m.role === "user" ? "#fff" : "var(--fg)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div style={{
              alignSelf: "flex-start", padding: "10px 14px", fontSize: 13,
              color: "var(--fg-muted)", background: "var(--bg-secondary)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            }}>
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 6 }}>{error}</p>}

        {/* Composer */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder="e.g. Given my goal, what should I prioritise next semester?"
            style={{
              flex: 1, fontSize: 13, padding: "10px 12px", lineHeight: 1.6,
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              background: "var(--bg)", color: "var(--fg)", outline: "none",
              resize: "none", fontFamily: "inherit",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="btn btn-primary"
            style={{ fontSize: 13, opacity: sending || !input.trim() ? 0.5 : 1 }}
          >
            Send
          </button>
        </div>
      </section>
    </main>
  );
}