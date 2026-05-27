"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/",       label: "About" },
  { href: "/stack",  label: "Stack" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <header style={{
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
      position: "sticky",
      top: 0,
      zIndex: 40,
    }}>
      <nav style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "0 24px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{ fontWeight: 500, fontSize: 14, color: "var(--fg)", textDecoration: "none" }}>
          YourName
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {LINKS.map(l => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                color: active ? "var(--accent)" : "var(--fg-muted)",
                textDecoration: "none",
                background: active ? "var(--accent-light)" : "transparent",
                transition: "color .15s, background .15s",
              }}>
                {l.label}
              </Link>
            );
          })}
          <a
            href="https://github.com/TobyChann"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "5px 12px", marginLeft: 8 }}
          >
            GitHub ↗
          </a>
        </div>
      </nav>
    </header>
  );
}
