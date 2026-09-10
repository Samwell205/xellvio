/**
 * Light / dark appearance for the whole site.
 *
 * The chosen mode is stored per visitor in localStorage and applied as the
 * `dark` class on <html>, which is what the design tokens in styles.css switch
 * on. "system" follows the visitor's device preference.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "xellvio-theme";

/** Inline script that runs before first paint so there is no flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=s==="dark"||((!s||s==="system")&&m);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked — fall back to system */
  }
  return "system";
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  if (typeof document !== "undefined") {
    const el = document.documentElement;
    el.classList.toggle("dark", resolved === "dark");
    el.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f111a" : "#ffffff");
  }
  return resolved;
}

export function setTheme(choice: ThemeChoice): ResolvedTheme {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* storage blocked — the choice still applies for this page */
  }
  window.dispatchEvent(new CustomEvent("xellvio:theme", { detail: choice }));
  return applyTheme(choice);
}
