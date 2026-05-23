"use client";
import { useState, useRef, useEffect } from "react";
import { onboard, sendQuery, sendFeedback } from "@/lib/api";
import { Message, VisitorRole, Industry } from "@/types";
import { nanoid } from "nanoid";

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

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [role, setRole] = useState<VisitorRole | null>(null);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore session from localStorage on mount
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
      setMessages([{
        id: nanoid(),
        role: "assistant",
        content: "Hi! Ask me anything about the candidate's skills, coursework, or projects.",
      }]);
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  async function handleSend(text?: string) {
    const question = text || input.trim();
    if (!question || !sessionId || loading) return;
    setInput("");
    setError("");

    const userMsg: Message = { id: nanoid(), role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await sendQuery(question, sessionId);
      setMessages(prev => [...prev, {
        id: nanoid(),
        role: "assistant",
        content: result.answer,
        queryId: result.query_id,
        feedback: null,
        responseMs: result.response_ms,
      }]);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(msgId: string, queryId: string, value: 1 | -1) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: value } : m));
    await sendFeedback(queryId, value);
  }

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-gray-700 transition-colors z-50"
          aria-label="Open chat"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl flex flex-col overflow-hidden z-50" style={{ maxHeight: "520px" }}>
          {/* Header */}
          <div className="bg-gray-900 px-4 py-3 flex justify-between items-center">
            <div>
              <p className="text-white text-sm font-medium">Ask about my profile</p>
              <p className="text-gray-400 text-xs">Powered by RAG</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
          </div>

          {/* Onboarding gate */}
          {!sessionId ? (
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-gray-500">Quick intro before we start:</p>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Who are you?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setRole(r.value)}
                      className={`text-xs py-1.5 px-2 rounded-lg border transition-colors ${role === r.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Your industry?</p>
                <div className="flex flex-wrap gap-1.5">
                  {INDUSTRIES.map(ind => (
                    <button
                      key={ind}
                      onClick={() => setIndustry(ind)}
                      className={`text-xs py-1 px-2.5 rounded-full border transition-colors ${industry === ind ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleOnboard}
                disabled={!role || !industry}
                className="text-sm py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40 hover:bg-gray-700 transition-colors"
              >
                Start chatting →
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`text-xs px-3 py-2 rounded-xl max-w-[90%] leading-relaxed ${msg.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}>
                      {msg.content}
                    </div>
                    {/* Feedback buttons on assistant messages */}
                    {msg.role === "assistant" && msg.queryId && (
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => handleFeedback(msg.id, msg.queryId!, 1)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${msg.feedback === 1 ? "text-green-600" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          👍
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, msg.queryId!, -1)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${msg.feedback === -1 ? "text-red-500" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          👎
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-start">
                    <div className="bg-gray-100 text-gray-400 text-xs px-3 py-2 rounded-xl">Thinking…</div>
                  </div>
                )}
                {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggested questions (only when no messages yet) */}
              {messages.length <= 1 && (
                <div className="px-3 pb-2 flex flex-col gap-1">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="text-left text-xs py-1.5 px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2 p-3 border-t border-gray-100">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSend()}
                  placeholder="Ask something…"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
                  disabled={loading}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="bg-gray-900 text-white rounded-lg px-3 py-2 text-xs disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
