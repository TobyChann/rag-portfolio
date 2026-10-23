"use client";
import { useEffect, useState } from "react";
import { openChat } from "@/lib/api";

const PROMPTS = [
  "What has Toby built?",
  "Has Toby used dbt or Airflow?",
  "What did Toby learn in valuation?",
  "Which SQL databases does Toby know?",
  "What work experience does Toby have?",
];

export default function AskBox() {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI(n => (n + 1) % PROMPTS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <form className="ask-box" role="search" onSubmit={e => { e.preventDefault(); openChat(q.trim() || PROMPTS[i]); setQ(""); }}>
      <label htmlFor="hero-ask" className="sr-only">Ask a question about Toby</label>
      <input id="hero-ask" value={q} onChange={e => setQ(e.target.value)} placeholder={PROMPTS[i]} maxLength={500} autoComplete="off" />
      <button type="submit" className="btn btn-primary">Ask</button>
    </form>
  );
}
