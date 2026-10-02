// Single source for the backend base URL; components import it from here.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function onboard(role: string, industry: string, referrer = "") {
  const res = await fetch(`${API_BASE}/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, industry, referrer }),
  });
  if (!res.ok) throw new Error("Onboarding failed");
  return res.json(); // { session_id }
}

export type QueryEvent =
  | { type: "sources"; sources: { google_doc_id: string; title: string }[] }
  | { type: "delta"; text: string }
  | { type: "done"; query_id: string | null; cache_hit: string | null; response_ms: number }
  | { type: "error"; detail: string };

/** Streams an answer from /query/stream (newline-delimited JSON), calling
 *  onEvent as each event arrives. Throws on HTTP errors before the stream. */
export async function streamQuery(question: string, sessionId: string,
                                  onEvent: (e: QueryEvent) => void) {
  const res = await fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Please try again later.");
  if (res.status === 401) throw new Error("Session expired. Please refresh.");
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

export async function sendFeedback(queryId: string, feedback: 1 | -1) {
  await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query_id: queryId, feedback }),
  });
}
