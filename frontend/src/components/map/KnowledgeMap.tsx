"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

// Every chunk of every note, placed by t-SNE (backend rag/projection.py).
// points: [x, y, doc index, chunk_index, heading index], x/y in [0, 1].
export interface MapData {
  modules: { key: number; name: string }[];
  docs: { id: string; name: string; module: number }[];
  headings: string[];
  points: [number, number, number, number, number][];
}

/** A thinned-out copy the server renders as SVG: shown before the canvas
 *  loads, and the whole map when JavaScript is off. */
export interface MapSnapshot {
  modules: string[];
  points: [number, number, number][];   // x, y, module
}

/** Fired by the chat with the chunk ids an answer was built from. */
export const TRACE_EVENT = "chat-trace";

let mapPromise: Promise<MapData | null> | null = null;
export function loadMap() {
  mapPromise ??= fetch(`${API_BASE}/map`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return mapPromise;
}

const PULSE_MS = 1600;
const STAGGER_MS = 90;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function palette() {
  const cs = getComputedStyle(document.documentElement);
  return {
    modules: Array.from({ length: 8 }, (_, i) => cs.getPropertyValue(`--map-${i + 1}`).trim() || "#888"),
    accent: cs.getPropertyValue("--accent").trim() || "#D4A017",
  };
}

type View = { k: number; tx: number; ty: number };
// Data [0,1] -> canvas px: a centred square (keeps the projection's shape), then the view.
function frame(w: number, h: number) {
  const s = Math.min(w, h) * 0.92;
  return { s, ox: (w - s) / 2, oy: (h - s) / 2 };
}

export default function KnowledgeMap({ snapshot }: { snapshot: MapSnapshot }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);
  const view = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const pulses = useRef<Map<number, number>>(new Map());   // point index -> start time
  const anim = useRef<{ from: View; to: View; start: number } | null>(null);
  const raf = useRef(0);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  // Load the full map only when the section is about to scroll into view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        loadMap().then(d => d && setData(d));
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Spatial grid in data space for hover / click hit-testing.
  const grid = useRef<Map<number, number[]>>(new Map());
  const keyIndex = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!data) return;
    const g = new Map<number, number[]>();
    data.points.forEach(([x, y], i) => {
      const key = Math.floor(x * 50) * 64 + Math.floor(y * 50);
      g.set(key, [...(g.get(key) ?? []), i]);
    });
    grid.current = g;
    keyIndex.current = new Map(data.points.map(([, , d, idx], i) => [`${data.docs[d].id}_${idx}`, i]));
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const { s, ox, oy } = frame(w, h);
    const now = performance.now();

    if (anim.current) {
      const t = Math.min(1, (now - anim.current.start) / 600);
      const e = 1 - Math.pow(1 - t, 3);
      const { from, to } = anim.current;
      view.current = { k: from.k + (to.k - from.k) * e, tx: from.tx + (to.tx - from.tx) * e, ty: from.ty + (to.ty - from.ty) * e };
      if (t === 1) anim.current = null;
    }
    const { k, tx, ty } = view.current;
    const colours = palette();
    const r = Math.max(1.6, Math.min(3.2, 1.9 * Math.sqrt(k)));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.72;
    data.points.forEach(([x, y, d]) => {
      const m = data.docs[d].module;
      if (hiddenRef.current.has(m)) return;
      ctx.fillStyle = colours.modules[m % 8];
      ctx.beginPath();
      ctx.arc((ox + x * s) * k + tx, (oy + y * s) * k + ty, r, 0, Math.PI * 2);
      ctx.fill();
    });

    let pulsing = false;
    const still = reducedMotion();
    pulses.current.forEach((start, i) => {
      const [x, y] = data.points[i];
      const px = (ox + x * s) * k + tx, py = (oy + y * s) * k + ty;
      const phase = still ? 1 : Math.max(0, Math.min(1, (now - start) / PULSE_MS));
      ctx.globalAlpha = 1;
      ctx.fillStyle = colours.accent;
      ctx.beginPath();
      ctx.arc(px, py, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colours.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = still ? 0.9 : Math.max(0.35, 1 - phase);
      ctx.beginPath();
      ctx.arc(px, py, r + 3 + (still ? 3 : 14 * phase), 0, Math.PI * 2);
      ctx.stroke();
      if (phase < 1 && now >= start) pulsing = true;
      if (now < start) pulsing = true;
    });
    ctx.globalAlpha = 1;
    if (pulsing || anim.current) raf.current = requestAnimationFrame(draw);
  }, [data]);

  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  // Size the canvas to its box (and the device pixel ratio), redraw on resize.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !data) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      redraw();
    });
    ro.observe(wrap);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, [data, redraw]);

  useEffect(redraw, [hidden, redraw]);

  // Redraw when the theme changes (colours are CSS variables).
  useEffect(() => {
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redraw);
    return () => { mo.disconnect(); mq.removeEventListener("change", redraw); };
  }, [redraw]);

  // Light up the chunks a chat answer used, and ease towards them.
  useEffect(() => {
    function onTrace(e: Event) {
      const ids = (e as CustomEvent<{ chunkIds: string[] }>).detail?.chunkIds ?? [];
      const hit = ids.map(id => keyIndex.current.get(id)).filter((i): i is number => i !== undefined);
      if (!data || !hit.length || !canvasRef.current) return;
      setTip(null);
      const now = performance.now();
      pulses.current = new Map(hit.map((i, n) => [i, now + n * STAGGER_MS]));
      const dpr = window.devicePixelRatio || 1;
      const w = canvasRef.current.width / dpr, h = canvasRef.current.height / dpr;
      const { s, ox, oy } = frame(w, h);
      const cx = hit.reduce((a, i) => a + data.points[i][0], 0) / hit.length;
      const cy = hit.reduce((a, i) => a + data.points[i][1], 0) / hit.length;
      const k = Math.max(view.current.k, 1.6);
      const to = { k, tx: w / 2 - (ox + cx * s) * k, ty: h / 2 - (oy + cy * s) * k };
      if (reducedMotion()) view.current = to;
      else anim.current = { from: { ...view.current }, to, start: now };
      redraw();
    }
    window.addEventListener(TRACE_EVENT, onTrace);
    return () => window.removeEventListener(TRACE_EVENT, onTrace);
  }, [data, redraw]);

  function pointAt(mx: number, my: number): number | null {
    if (!data || !canvasRef.current) return null;
    const dpr = window.devicePixelRatio || 1;
    const { s, ox, oy } = frame(canvasRef.current.width / dpr, canvasRef.current.height / dpr);
    const { k, tx, ty } = view.current;
    const x = ((mx - tx) / k - ox) / s, y = ((my - ty) / k - oy) / s;
    const reach = 9 / (s * k);
    let best: number | null = null, bestD = reach * reach;
    for (let gx = Math.floor((x - reach) * 50); gx <= Math.floor((x + reach) * 50); gx++) {
      for (let gy = Math.floor((y - reach) * 50); gy <= Math.floor((y + reach) * 50); gy++) {
        for (const i of grid.current.get(gx * 64 + gy) ?? []) {
          const [px, py, d] = data.points[i];
          if (hiddenRef.current.has(data.docs[d].module)) continue;
          const dd = (px - x) ** 2 + (py - y) ** 2;
          if (dd < bestD) { bestD = dd; best = i; }
        }
      }
    }
    return best;
  }

  // Pan with one pointer, pinch with two, click to open the note.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const moved = useRef(0);
  function local(e: React.PointerEvent | WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function zoomAt(px: number, py: number, factor: number) {
    const v = view.current;
    const k = Math.min(12, Math.max(0.8, v.k * factor));
    const f = k / v.k;
    view.current = { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
    redraw();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [data, redraw]);   // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = 0;
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      const i = pointAt(p.x, p.y);
      if (i === null || !data) { setTip(null); return; }
      const doc = data.docs[data.points[i][2]];
      setTip({ x: p.x, y: p.y, title: data.headings[data.points[i][4]] || doc.name, sub: doc.name });
      return;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.current.set(e.pointerId, p);
      const [c, d] = [...pointers.current.values()];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      if (before > 0) zoomAt((c.x + d.x) / 2, (c.y + d.y) / 2, after / before);
    } else {
      view.current = { ...view.current, tx: view.current.tx + p.x - prev.x, ty: view.current.ty + p.y - prev.y };
      pointers.current.set(e.pointerId, p);
      redraw();
    }
    moved.current += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    canvasRef.current!.classList.add("dragging");
    setTip(null);
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    canvasRef.current!.classList.remove("dragging");
    if (moved.current < 5 && data) {
      const i = pointAt(p.x, p.y);
      if (i !== null) {
        const [, , d, idx] = data.points[i];
        window.location.href = `/notes/${data.docs[d].id}#chunk-${idx}`;
      }
    }
  }

  const modules = data ? data.modules.map(m => m.name) : snapshot.modules;

  return (
    <div>
      <div ref={wrapRef} className="kmap">
        {!data && (
          <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" role="img" opacity={0.7}
               aria-label={`Knowledge map: ${snapshot.points.length} sampled passages from Toby's notes, coloured by area`}>
            {snapshot.points.map(([x, y, m], i) => (
              <circle key={i} cx={+(0.04 + x * 0.92).toFixed(3)} cy={+(0.04 + y * 0.92).toFixed(3)} r={0.005} fill={`var(--map-${(m % 8) + 1})`} />
            ))}
          </svg>
        )}
        {data && (
          <canvas ref={canvasRef} role="img"
                  aria-label={`Knowledge map of ${data.points.length} passages across ${data.docs.length} notes. Hover a point for its section; click to open the note.`}
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                  onPointerLeave={() => setTip(null)} onPointerCancel={onPointerUp} />
        )}
        {tip && (
          <div className="kmap-tip" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.title}</strong>
            {tip.title !== tip.sub && <div style={{ color: "var(--fg-subtle)", fontSize: 11 }}>{tip.sub}</div>}
          </div>
        )}
        {data && (
          <div className="kmap-controls">
            <button className="icon-btn" aria-label="Zoom in" onClick={() => { const c = canvasRef.current!; zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1.4); }}>+</button>
            <button className="icon-btn" aria-label="Zoom out" onClick={() => { const c = canvasRef.current!; zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1 / 1.4); }}>−</button>
            <button className="icon-btn" aria-label="Reset view" onClick={() => { view.current = { k: 1, tx: 0, ty: 0 }; pulses.current.clear(); redraw(); }}>⟲</button>
          </div>
        )}
      </div>
      <div className="kmap-legend" role="group" aria-label="Show or hide areas">
        {modules.map((name, m) => (
          <button key={name} aria-pressed={!hidden.has(m)}
                  onClick={() => setHidden(h => { const n = new Set(h); n.has(m) ? n.delete(m) : n.add(m); return n; })}>
            <i style={{ background: `var(--map-${(m % 8) + 1})` }} />{name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small static map for "How this was answered": every passage faint, the
 *  ones this answer used in accent. */
export function MiniMap({ chunkIds }: { chunkIds: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => { loadMap().then(setData); }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const { s, ox, oy } = frame(w, h);
    const colours = palette();
    const used = new Set(chunkIds);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.22;
    const hits: [number, number][] = [];
    data.points.forEach(([x, y, d, idx]) => {
      const px = ox + x * s, py = oy + y * s;
      if (used.has(`${data.docs[d].id}_${idx}`)) hits.push([px, py]);
      ctx.fillStyle = colours.modules[data.docs[d].module % 8];
      ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = colours.accent;
    ctx.strokeStyle = colours.accent;
    hits.forEach(([px, py]) => {
      ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
    });
  }, [data, chunkIds]);

  if (!data) return null;
  return (
    <div className="kmap-mini">
      <canvas ref={ref} role="img" aria-label="Where the passages behind this answer sit on the knowledge map" />
    </div>
  );
}
