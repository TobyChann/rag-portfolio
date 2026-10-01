"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { API_BASE as API } from "@/lib/api";

export default function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if admin session is active
  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => setIsAdmin(r.ok))
      .catch(() => setIsAdmin(false));
  }, [path]);

  async function handleLogout() {
    try {
      await fetch(`${API}/admin/logout`, { method: "POST", credentials: "include" });
    } finally {
      setIsAdmin(false);
      router.push("/");
      router.refresh();
    }
  }

  const linkStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 500, padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    color: active ? "var(--accent)" : "var(--fg-muted)",
    textDecoration: "none",
    background: active ? "var(--accent-light)" : "transparent",
    border: "none", cursor: "pointer", fontFamily: "inherit",
    transition: "color .15s, background .15s",
  });

  const NAV_LINKS = [
    { href: "/stack", label: "Stack" },
    ...(isAdmin ? [
      { href: "/planning", label: "Planning" },
      { href: "/admin",    label: "Admin" },
    ] : []),
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
        {/* Wordmark — replaces the icon; leads home, so no About link needed */}
        <Link href="/" style={{
          fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
          color: "var(--fg)", textDecoration: "none",
        }}>
          My Portfolio<span style={{ color: "var(--accent)" }}>.</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={linkStyle(path === l.href)}>
              {l.label}
            </Link>
          ))}

          <a
            href="https://github.com/TobyChann"
            target="_blank" rel="noopener noreferrer"
            style={linkStyle(false)}
          >
            GitHub
          </a>

          {/* Rightmost auth slot: Login ↔ Logout */}
          {isAdmin ? (
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "5px 12px", marginLeft: 8 }}
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "5px 12px", marginLeft: 8 }}
            >
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}