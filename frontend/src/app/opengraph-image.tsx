import { ImageResponse } from "next/og";
import { serverFetch } from "@/lib/api";
import { PROFILE, EDUCATION } from "@/lib/profile";

export const alt = `${PROFILE.name}: ${PROFILE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;
// Edge: the Node build of @vercel/og in Next 14.2 fails to load on Windows.
export const runtime = "edge";

const ORDER = ["extract", "load", "transform", "frontend", "insights", "db_layer", "bottom_bar", "top_bar"];

export default async function Image() {
  const skills = await serverFetch<Record<string, string[]>>("/skills", {});
  const top = ORDER.flatMap(k => (skills[k] ?? []).slice(0, 2)).slice(0, 6);

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "72px 80px", color: "#111111",
        // TODO asset: Haikei SVG background (claude/PLAN_V2.md §3.4); gradient placeholder until then.
        backgroundColor: "#FFFFFF",
        backgroundImage: "radial-gradient(circle at 10% 20%, #FDE68A 0%, rgba(253,230,138,0) 45%), radial-gradient(circle at 95% 0%, #FEF3C7 0%, rgba(254,243,199,0) 40%)",
      }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
          {PROFILE.name}<span style={{ color: "#D4A017" }}>.</span>
        </div>
        <div style={{ fontSize: 32, color: "#4B5563", marginTop: 12 }}>{PROFILE.tagline}</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "#92400E", fontWeight: 600 }}>
          cGPA {EDUCATION.gpa}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          {top.map(s => (
            <div key={s} style={{ display: "flex", fontSize: 24, padding: "8px 18px", borderRadius: 999, background: "#FFFFFF", border: "2px solid #E5E7EB" }}>
              {s}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 22, color: "#6B7280" }}>
          Ask the AI assistant grounded in my study notes →
        </div>
      </div>
    ),
    size,
  );
}
