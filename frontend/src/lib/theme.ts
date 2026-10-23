// Light / dark / system theme. layout.tsx applies the saved choice before
// first paint; this switches it at runtime and tells listeners (the navbar
// icon) via THEME_EVENT.
export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];
export const THEME_EVENT = "theme-change";

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

export function cycleTheme(): Theme {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  if (next === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try { next === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", next); } catch { /* not saved */ }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  return next;
}
