import Link from "next/link";
import { PROFILE } from "@/lib/profile";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "20px var(--gutter)" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--fg-subtle)" }}>
        <p>&copy; {new Date().getFullYear()} {PROFILE.fullName}</p>
        <Link href="/stack" style={{ color: "var(--fg-muted)" }}>How this site works →</Link>
      </div>
    </footer>
  );
}
