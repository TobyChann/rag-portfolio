"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function NavBar() {
  const path = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if admin session is active
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, [path]);

  const NAV_LINKS = [
    { href: "/",      label: "About" },
    { href: "/stack", label: "Stack" },
  ];

  return (
    <header style={{
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
      position: "sticky", top: 0, zIndex: 40,
    }}>
      <nav style={{
        maxWidth: 720, margin: "0 auto", padding: "0 24px",
        height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontWeight: 600, fontSize: 14,
          color: "var(--fg)", textDecoration: "none",
        }}>
          Toby Chan
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_LINKS.map(l => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                fontSize: 13, fontWeight: 500, padding: "6px 12px",
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

          {/* Show Admin link if logged in, Login if not */}
          {isAdmin ? (
            <Link href="/admin" style={{
              fontSize: 13, fontWeight: 500, padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              color: path === "/admin" ? "var(--accent)" : "var(--fg-muted)",
              textDecoration: "none",
              background: path === "/admin" ? "var(--accent-light)" : "transparent",
              transition: "color .15s, background .15s",
            }}>
              Admin
            </Link>
          ) : (
            <Link href="/login" style={{
              fontSize: 13, fontWeight: 500, padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              color: path === "/login" ? "var(--accent)" : "var(--fg-muted)",
              textDecoration: "none",
              background: path === "/login" ? "var(--accent-light)" : "transparent",
              transition: "color .15s, background .15s",
            }}>
              Login
            </Link>
          )}

          <a
            href="https://github.com/yourusername"
            target="_blank" rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "5px 12px", marginLeft: 8 }}
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}