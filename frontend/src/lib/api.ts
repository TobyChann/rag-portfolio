import type { Source, Citation, Trace } from "@/types";

// Single source for the backend base URL; components import it from here.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Server components call the backend directly (on Vercel, BACKEND_URL is the
// VM; /api/* rewriting only exists for browser requests).
const SERVER_API = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api` : API_BASE;

/** ISR fetch for server components. Never throws: a backend that's down at
 *  build time yields the fallback, and the page refills on revalidation. */
export async function serverFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, { next: { revalidate: 300, tags: ["portfolio"] } });
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

export async function onboard(referrer = "") {
  const res = await fetch(`${API_BASE}/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referrer }),
  });
  if (!res.ok) throw new Error("Couldn't start a chat session");
  return res.json() as Promise<{ session_id: string }>;
}

export async function updateVisitor(sessionId: string, fields: { role?: string; industry?: string }) {
  await fetch(`${API_BASE}/visitor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, ...fields }),
  });
}

export type QueryEvent =
  | { type: "sources"; sources: Source[]; citations?: Citation[] }
  | { type: "delta"; text: string }
  | ({ type: "trace" } & Trace)
  | { type: "followups"; questions: string[] }
  | { type: "done"; query_id: string | null; cache_hit: string | null; response_ms: number }
  | { type: "error"; detail: string };

export class SessionExpired extends Error {}

/** Streams an answer from /query/stream (newline-delimited JSON), calling
 *  onEvent as each event arrives. Throws on HTTP errors before the stream. */
export async function streamQuery(question: string, sessionId: string,
                                  onEvent: (e: QueryEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
    signal,
  });
  if (res.status === 429) throw new Error("Rate limit reached. Please try again later.");
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok || !res.body) throw new Error("Query failed");

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
      if (line) onEvent(JSON.parse(line) as QueryEvent);
    }
  }
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
