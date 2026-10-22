import { useEffect, useRef, type CSSProperties } from "react";

/**
 * Renders user-authored HTML only after sanitizing it in the browser, so
 * stored custom HTML can never run scripts for page visitors. Nothing is
 * rendered on the server (DOMPurify needs a DOM).
 */
export function SafeHtml({ html, style }: { html: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    import("dompurify").then(({ default: DOMPurify }) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = DOMPurify.sanitize(html, {
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta"],
        FORBID_ATTR: ["srcdoc"],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [html]);
  return <div ref={ref} style={style} />;
}
