"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  src: string;
  alt: string;
  fallbackLabel?: string;
}

export default function PinchZoomImage({ src, alt, fallbackLabel }: Props) {
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const overlayRef   = useRef<HTMLDivElement>(null);
  const scaleRef     = useRef(1);
  const offsetRef    = useRef({ x: 0, y: 0 });

  // Keep refs in sync so mouse handlers always see latest values
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // ── Mouse drag ──────────────────────────────────────────
  const dragStart  = useRef<{ x: number; y: number } | null>(null);
  const offsetAtDragStart = useRef({ x: 0, y: 0 });

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetAtDragStart.current = { ...offsetRef.current };
  }

  useEffect(() => {
    if (!zoomed) return;

    function onMouseMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const next = {
        x: offsetAtDragStart.current.x + dx,
        y: offsetAtDragStart.current.y + dy,
      };
      offsetRef.current = next;
      setOffset(next);
    }

    function onMouseUp() {
      dragStart.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [zoomed]);

  // ── Wheel zoom ──────────────────────────────────────────
  useEffect(() => {
    if (!zoomed) return;
    const el = overlayRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const next = Math.min(Math.max(scaleRef.current * factor, 1), 6);
      scaleRef.current = next;
      setScale(next);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoomed]);

  // ── Escape ──────────────────────────────────────────────
  useEffect(() => {
    if (!zoomed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeZoom(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomed]);

  // ── Touch pinch + drag ──────────────────────────────────
  const lastDist   = useRef<number | null>(null);
  const lastTouch  = useRef<{ x: number; y: number } | null>(null);
  const isTouchDragging = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.sqrt(dx * dx + dy * dy);
      isTouchDragging.current = false;
    } else {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isTouchDragging.current = true;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastDist.current !== null) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const next = Math.min(Math.max(scaleRef.current * (dist / lastDist.current), 1), 6);
      scaleRef.current = next;
      setScale(next);
      lastDist.current = dist;
    } else if (e.touches.length === 1 && lastTouch.current && isTouchDragging.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      const next = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
      offsetRef.current = next;
      setOffset(next);
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function onTouchEnd() {
    lastDist.current = null;
    isTouchDragging.current = false;
  }

  function closeZoom() {
    setZoomed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }

  return (
    <>
      <div
        onClick={() => setZoomed(true)}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--bg-secondary)",
          cursor: "zoom-in",
          position: "relative",
          minHeight: 200,
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "auto", display: "block" }}
          onError={e => {
            const el = e.target as HTMLImageElement;
            el.style.display = "none";
            el.parentElement!.innerHTML = `
              <div style="display:flex;align-items:center;justify-content:center;
                height:200px;color:var(--fg-subtle);font-size:13px;
                padding:24px;text-align:center">
                ${fallbackLabel ?? "Image not found"}
              </div>`;
          }}
        />
        <div style={{
          position: "absolute", bottom: 10, right: 10,
          background: "rgba(0,0,0,0.45)", color: "#fff",
          fontSize: 11, padding: "3px 10px", borderRadius: 20,
          backdropFilter: "blur(4px)", pointerEvents: "none",
        }}>
          click to zoom
        </div>
      </div>

      {zoomed && createPortal(
        <div
          ref={overlayRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, overflow: "hidden", touchAction: "none",
            cursor: dragStart.current ? "grabbing" : scale > 1 ? "grab" : "default",
            userSelect: "none",
          }}
        >
          <button
            onClick={closeZoom}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: "absolute", top: 16, right: 16, zIndex: 101,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,.15)",
              border: "1px solid rgba(255,255,255,.3)",
              color: "#fff", cursor: "pointer", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>

          <p style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,.4)", fontSize: 11,
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            Scroll to zoom · drag to pan · {Math.round(scale * 100)}%
          </p>

          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{
              maxWidth: "92vw", maxHeight: "88vh",
              objectFit: "contain",
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: dragStart.current ? "none" : "transform 0.05s linear",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}