import { useEffect } from "react";

/**
 * Prefix the browser tab title with an unread-style count, e.g. "(2) Support — Xellvio",
 * so a new ticket or reply is visible from another tab. Restores the title on cleanup.
 */
export function useTabBadge(count: number) {
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [count]);
}
