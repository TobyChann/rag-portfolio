"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  src: string;
  alt: string;
  fallbackLabel?: string;
}

export default function PinchZoomImage({ src, alt, fallbackLabel }: Props) {
  const [zoomed, setZoomed]   = useState(false);
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });

  const overlayRef  = useRef<HTMLDivElement>(null);
  const lastDist    = useRef<number | null>(null);
  const lastPos     = useRef<{ x: number; y: number } | null>(null);
  const isDragging  = useRef(false);

  // Attach wheel listener as non-passive so preventDefault works
  useEffect(() => {
    if (!zoomed) return;
    const el = overlayRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(s => Math.min(Math.max(s * factor, 1), 6));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoomed]);

  // Close on Escape
  useEffect(() => {
    if (!zoomed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeZoom(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomed]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.sqrt(dx * dx + dy * dy);
    } else {
      lastPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isDragging.current = true;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastDist.current !== null) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setScale(s => Math.min(Math.max(s * (dist / lastDist.current!), 1), 6));
      lastDist.current = dist;
    } else if (e.touches.length === 1 && lastPos.current && isDragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function onTouchEnd() {
    lastDist.current   = null;
    isDragging.current = false;
  }

  function closeZoom() {
    setZoomed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <>
      {/* Thumbnail */}
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

      {/* Fullscreen overlay — portalled to body to escape any parent transform/stacking context */}
      {zoomed && createPortal(
        <div
          ref={overlayRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, overflow: "hidden", touchAction: "none",
          }}
        >
          {/* Close */}
          <button
            onClick={closeZoom}
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

          {/* Scale indicator */}
          <p style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,.4)", fontSize: 11,
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            Pinch or scroll to zoom · drag to pan · {Math.round(scale * 100)}%
          </p>

          <img
            src={src}
            alt={alt}
            className="fade-in"
            draggable={false}
            style={{
              maxWidth: "92vw", maxHeight: "88vh",
              objectFit: "contain",
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transformOrigin: "center center",
              transition: "transform 0.04s linear",
              userSelect: "none",
              cursor: scale > 1 ? "grab" : "default",
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}