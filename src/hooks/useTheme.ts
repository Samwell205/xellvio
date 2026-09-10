import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  resolveTheme,
  setTheme as persistTheme,
  storedTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

/** Read and change the site appearance. Safe during SSR (starts on "system"). */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = storedTheme();
    setChoice(current);
    setResolved(applyTheme(current));
    setReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (storedTheme() === "system") setResolved(applyTheme("system"));
    };
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<ThemeChoice>).detail;
      setChoice(next);
      setResolved(resolveTheme(next));
    };
    media.addEventListener("change", onSystem);
    window.addEventListener("xellvio:theme", onCustom);
    return () => {
      media.removeEventListener("change", onSystem);
      window.removeEventListener("xellvio:theme", onCustom);
    };
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoice(next);
    setResolved(persistTheme(next));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolveTheme(storedTheme()) === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme: choice, resolvedTheme: resolved, ready, setTheme, toggle };
}
