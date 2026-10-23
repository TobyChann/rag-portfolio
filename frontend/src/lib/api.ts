import type { Source, Citation, Trace, MatchRequirement, MatchRow, MatchSummary } from "@/types";

// Single source for the backend base URL; components import it from here.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Server components call the backend directly (on Vercel, BACKEND_URL is the
// VM; /api/* rewriting only exists for browser requests).
const SERVER_API = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api` : API_BASE;

/** ISR fetch for server components. Never throws: a backend that's down at
 *  build time yields the fallback, and the page refills on revalidation. */
export async function serverFetch<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, init ?? { next: { revalidate: 300, tags: ["portfolio"] } });
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

// ── Visitor session (created silently on first use, shared by chat and /match) ──

export const SESSION_KEY = "portfolio_session";
export const REF_KEY = "portfolio_ref";

export function readStored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStored(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
}

export async function ensureSession(fresh = false): Promise<string> {
  if (!fresh) {
    const stored = readStored(SESSION_KEY);
    if (stored) return stored;
  }
  const res = await fetch(`${API_BASE}/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referrer: readStored(REF_KEY) ?? "" }),
  });
  if (!res.ok) throw new Error("Couldn't start a session");
  const { session_id } = await res.json();
  writeStored(SESSION_KEY, session_id);
  return session_id;
}

export async function updateVisitor(sessionId: string,
                                    fields: { role?: string; industry?: string; role_context?: string }) {
  await fetch(`${API_BASE}/visitor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, ...fields }),
  });
}

// ── Streaming (newline-delimited JSON) ──

export class SessionExpired extends Error {}

/** POSTs and calls onEvent per NDJSON line. Throws on HTTP errors before the
 *  stream starts (401 as SessionExpired). */
async function streamNdjson<E>(path: string, body: object, onEvent: (e: E) => void, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok || !res.body) {
    const detail = await res.json().then(d => d?.detail, () => null);
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as E);
    }
  }
}

export type QueryEvent =
  | { type: "sources"; sources: Source[]; citations?: Citation[] }
  | { type: "delta"; text: string }
  | ({ type: "trace" } & Trace)
  | { type: "followups"; questions: string[] }
  | { type: "done"; query_id: string | null; cache_hit: string | null; response_ms: number }
  | { type: "error"; detail: string };

export function streamQuery(question: string, sessionId: string,
                            onEvent: (e: QueryEvent) => void, signal?: AbortSignal) {
  return streamNdjson<QueryEvent>("/query/stream", { question, session_id: sessionId }, onEvent, signal);
}

export type MatchEvent =
  | { type: "requirements"; company_guess: string | null; role_title: string | null; requirements: MatchRequirement[] }
  | { type: "row"; row: MatchRow }
  | ({ type: "summary" } & MatchSummary)
  | { type: "done"; match_id: string | null; cached: boolean }
  | { type: "error"; detail: string };

export function streamMatch(jd: string, sessionId: string, onEvent: (e: MatchEvent) => void, signal?: AbortSignal) {
  return streamNdjson<MatchEvent>("/match", { jd, session_id: sessionId }, onEvent, signal);
}

export async function clearConversation(sessionId: string) {
  await fetch(`${API_BASE}/conversation?session_id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function sendFeedback(queryId: string, feedback: 1 | -1) {
  await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query_id: queryId, feedback }),
  });
}

/** Any component can open the chat panel, optionally asking a question. */
export const OPEN_CHAT_EVENT = "open-chat";
export function openChat(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { question } }));
}
