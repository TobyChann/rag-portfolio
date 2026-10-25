"use client";
import { useEffect } from "react";
import { openChat } from "@/lib/api";

// "Ask about this note", plus resolving #chunk-N links from chat citations:
// a citation can point at any chunk, the outline only lists the first chunk
// of each section, so highlight the section that contains N.
export default function NoteActions({ docId, title }: { docId: string; title: string }) {
  useEffect(() => {
    const m = window.location.hash.match(/^#chunk-(\d+)$/);
    if (!m) return;
    const target = Number(m[1]);
    const items = [...document.querySelectorAll<HTMLElement>(".note-outline li[data-index]")];
    const before = items.filter(li => Number(li.dataset.index) <= target);
    const hit = before[before.length - 1] ?? items[0];
    if (!hit) return;
    hit.classList.add("cited");
    hit.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
      <button className="btn btn-primary" onClick={() => openChat(`What did you learn in ${title}?`, docId)}>
        Ask me about this note
      </button>
    </div>
  );
}
