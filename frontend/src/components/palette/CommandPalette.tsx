"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, openChat } from "@/lib/api";
import { cycleTheme } from "@/lib/theme";

interface Hit {
  google_doc_id: string;
  display_name: string;
  heading: string;
  chunk_index: number;
  snippet: string;
}

type Item =
  | { kind: "note"; id: string; hit: Hit }
  | { kind: "action"; id: string; label: string; hint?: string; run: () => void };

// The API marks matches with ⟦ ⟧ rather than HTML, so nothing is injected.
function Snippet({ text }: { text: string }) {
  const parts = text.split(/⟦|⟧/);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Live note search, debounced; a newer query cancels the one in flight.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setHits([]); setStatus("idle"); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.status === 429) { setError("Search limit reached for now. Try again later."); setStatus("error"); return; }
        if (!res.ok) throw new Error();
        setHits(await res.json());
        setStatus("idle");
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError("Search is unavailable right now."); setStatus("error");
      }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (href: string) => { onClose(); router.push(href); };
  const items: Item[] = useMemo(() => {
    const query = q.trim();
    const actions: Item[] = [
      ...(query ? [{ kind: "action" as const, id: "ask", label: `Ask: “${query}”`, hint: "Chat",
                     run: () => { onClose(); openChat(query); } }] : []),
      { kind: "action", id: "match", label: "Match Toby to a job description", hint: "/match", run: () => go("/match") },
      { kind: "action", id: "resume", label: "Download resume", hint: "PDF",
        run: () => { onClose(); window.location.href = `${API_BASE}/resume`; } },
      { kind: "action", id: "map", label: "Open the knowledge map", hint: "Home",
        run: () => go("/#map-heading") },
      { kind: "action", id: "stack", label: "How this site works", hint: "/stack", run: () => go("/stack") },
      { kind: "action", id: "theme", label: "Switch theme (system / light / dark)", run: () => { cycleTheme(); } },
    ];
    const notes: Item[] = hits.map((h, i) => ({ kind: "note", id: `note-${i}`, hit: h }));
    return [...notes, ...actions];
  }, [hits, q]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(0); }, [hits, q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: Item) {
    if (item.kind === "note") go(`/notes/${item.hit.google_doc_id}#chunk-${item.hit.chunk_index}`);
    else item.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) choose(items[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault();   // focus stays in the search box
  }

  const noteCount = items.filter(i => i.kind === "note").length;
  const optionId = (i: number) => `palette-opt-${i}`;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search notes and actions"
           onMouseDown={e => e.stopPropagation()}>
        <div className="palette-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
          </svg>
          <input
            ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search Toby's notes, or type a question…" maxLength={200}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
            aria-activedescendant={items.length ? optionId(active) : undefined}
          />
          {status === "loading" && <span className="shimmer" style={{ fontSize: 12 }}>Searching…</span>}
          <kbd>Esc</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="palette-list">
          {q.trim().length >= 2 && (
            <p className="palette-group" role="presentation">
              Notes {status === "idle" && noteCount === 0 && <span style={{ fontWeight: 400 }}>· no matching passages</span>}
              {status === "error" && <span style={{ fontWeight: 400, color: "var(--danger)" }}> · {error}</span>}
            </p>
          )}
          {items.map((item, i) => {
            const first = item.kind === "action" && (i === 0 || items[i - 1].kind === "note");
            return (
              <div key={item.id}>
                {first && <p className="palette-group" role="presentation">Actions</p>}
                <div id={optionId(i)} data-index={i} role="option" aria-selected={i === active}
                     className="palette-option" onMouseMove={() => setActive(i)} onClick={() => choose(item)}>
                  {item.kind === "note" ? (
                    <div style={{ minWidth: 0 }}>
                      <div className="palette-title">
                        {item.hit.display_name}
                        {item.hit.heading && <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}> · {item.hit.heading}</span>}
                      </div>
                      {item.hit.snippet && <div className="palette-snippet"><Snippet text={item.hit.snippet} /></div>}
                    </div>
                  ) : (
                    <>
                      <span className="palette-title" style={{ fontWeight: 500 }}>{item.label}</span>
                      {item.hint && <span className="palette-hint">{item.hint}</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span>
        </div>
      </div>
    </div>
  );
}
