// Light / dark / system. The choice is saved with the account (prefs.theme) and mirrored in localStorage,
// so the inline script in app/layout.tsx can apply it before the first paint.

import type { Theme } from "./nutrition";

export const THEME_KEY = "calai-theme";

/** Runs in <head> before React; keep it tiny and dependency-free. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage blocked: the theme still applies for this visit
  }
}
