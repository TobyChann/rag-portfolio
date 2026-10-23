import { ImageResponse } from "next/og";
import { serverFetch } from "@/lib/api";
import { PROFILE } from "@/lib/profile";
import type { NotePage } from "@/types";

export const alt = "Toby Chan's study notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;
export const runtime = "edge";

export default async function Image({ params }: { params: { docId: string } }) {
  const n = await serverFetch<NotePage | null>(`/notes/${encodeURIComponent(params.docId)}`, null);
  const bg = await fetch(new URL("../../../../public/bg/blob-light.svg", import.meta.url)).then(r => r.text());
  const title = n ? n.module_path[n.module_path.length - 1] ?? n.display_name : "Study notes";

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "72px 80px", color: "#111111", backgroundColor: "#FFFFFF", position: "relative",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/svg+xml;base64,${btoa(bg)}`} width={1200} height={630} alt=""
             style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630 }} />
        <div style={{ display: "flex", fontSize: 26, color: "#92400E", fontWeight: 600 }}>{PROFILE.name} · study notes</div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, letterSpacing: -1.5, marginTop: 14, lineHeight: 1.1 }}>{title}</div>
        {n?.grade && <div style={{ display: "flex", fontSize: 28, color: "#4B5563", marginTop: 16 }}>Grade {n.grade}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
          {(n?.skills ?? []).slice(0, 6).map(s => (
            <div key={s} style={{ display: "flex", fontSize: 24, padding: "8px 18px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #E5E7EB" }}>
              {s}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 22, color: "#6B7280" }}>
          Ask the AI assistant about these notes →
        </div>
      </div>
    ),
    size,
  );
}
