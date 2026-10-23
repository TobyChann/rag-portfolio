"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { API_BASE as API, openChat } from "@/lib/api";

type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  system: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
  light:  <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  dark:   <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
};

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "light" || t === "dark" ? t : "system");
  }, []);

  function cycle() {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try { next === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", next); } catch { /* not saved */ }
  }

  return (
    <button onClick={cycle} className="icon-btn" aria-label={`Theme: ${theme}. Switch theme`} title={`Theme: ${theme}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {THEME_ICONS[theme]}
      </svg>
    </button>
  );
}

export default function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    fetch(`${API}/admin/me`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : { authenticated: false }))
      .then(d => setIsAdmin(!!d.authenticated))
      .catch(() => setIsAdmin(false));
  }, [path]);

  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []);

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
    fontSize: 13, fontWeight: 500, padding: "6px 10px",
    borderRadius: "var(--radius-sm)",
    color: active ? "var(--accent-text)" : "var(--fg-muted)",
    textDecoration: "none",
    background: active ? "var(--accent-light)" : "transparent",
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
      background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(8px)",
      position: "sticky", top: 0, zIndex: 40,
    }}>
      <nav className="nav-inner" aria-label="Main" style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Link href="/" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)", textDecoration: "none", whiteSpace: "nowrap" }}>
          Toby Chan<span style={{ color: "var(--accent)" }}>.</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={linkStyle(path === l.href)} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}

          <button onClick={() => openChat()} className="icon-btn" aria-label="Ask a question" aria-keyshortcuts="Control+K Meta+K">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
            </svg>
            <kbd className="nav-kbd">{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>

          <a href="https://github.com/TobyChann" target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label="GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/>
            </svg>
          </a>

          <ThemeToggle />

          {isAdmin && (
            <button onClick={handleLogout} className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px", marginLeft: 6 }}>
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
