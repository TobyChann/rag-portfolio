import { ImageResponse } from "next/og";

// The home-screen icon: the same monogram as icon.svg, as a PNG for iOS.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "edge";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111827" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <g fill="none" stroke="#F9FAFB" strokeWidth="5.5" strokeLinecap="round">
            <path d="M11 21h17M19.5 21v22" />
            <path d="M47.5 24.2a10.5 10.5 0 1 0 0 15.6" />
          </g>
          <circle cx="54.5" cy="42" r="3.6" fill="#F59E0B" />
        </svg>
      </div>
    ),
    size,
  );
}
