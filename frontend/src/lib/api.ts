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

export async function sendQuery(question: string, sessionId: string) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Please try again later.");
  if (res.status === 401) throw new Error("Session expired. Please refresh.");
  if (res.status === 503) throw new Error("The model is briefly busy — please try again in a moment.");
  if (!res.ok) throw new Error("Query failed");
  return res.json();
}

export async function sendFeedback(queryId: string, feedback: 1 | -1) {
  await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query_id: queryId, feedback }),
  });
}
