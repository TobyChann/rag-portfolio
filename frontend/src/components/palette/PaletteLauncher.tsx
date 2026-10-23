"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// The palette itself loads on first open.
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

export const OPEN_PALETTE_EVENT = "open-palette";
export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export default function PaletteLauncher() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => { opener.current = document.activeElement as HTMLElement | null; setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); show(); }
    };
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_PALETTE_EVENT, show); window.removeEventListener("keydown", onKey); };
  }, []);

  if (!open) return null;
  return <CommandPalette onClose={() => { setOpen(false); opener.current?.focus?.(); }} />;
}
