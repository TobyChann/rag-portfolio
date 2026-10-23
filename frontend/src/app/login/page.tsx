"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE as API } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Invalid password");
      }
      router.push("/admin");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "80vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 360,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "32px 28px",
        boxShadow: "var(--shadow-md)",
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Admin login</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 24 }}>
          This area is restricted to the portfolio owner.
        </p>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                width: "100%", fontSize: 13, padding: "9px 12px",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                background: "var(--bg)", color: "var(--fg)", outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "var(--danger)", background: "var(--danger-bg)", padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", opacity: (loading || !password) ? 0.5 : 1 }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}