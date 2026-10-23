"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { OPEN_CHAT_EVENT } from "@/lib/api";

// The panel (and react-markdown with it) loads on first open, so pages that
// never open the chat don't ship it.
const ChatPanel = dynamic(() => import("./ChatPanel"), { ssr: false });

export const REF_KEY = "portfolio_ref";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<{ q: string; n: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Keep the first ?ref= this browser arrived with, so attribution survives
  // navigating around before the chat is opened.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, ref.slice(0, 200));
    } catch { /* storage blocked: attribution is best-effort */ }
  }, []);

  useEffect(() => {
    function show(question?: string) {
      opener.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      if (question) setAsk(a => ({ q: question, n: (a?.n ?? 0) + 1 }));
    }
    const onOpen = (e: Event) => show((e as CustomEvent<{ question?: string }>).detail?.question);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); show(); }
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_CHAT_EVENT, onOpen); window.removeEventListener("keydown", onKey); };
  }, []);

  function close() {
    setOpen(false);
    setAsk(null);
    opener.current?.focus?.();
  }

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={e => { opener.current = e.currentTarget; setOpen(true); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Ask about my profile
        </button>
      )}
      {open && <ChatPanel ask={ask} onClose={close} />}
    </>
  );
}
