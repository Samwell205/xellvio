import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Fit the whole email width into its tile without clipping either edge. */
export function EmailTemplatePreview({ html, title }: { html: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / 640);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setLoaded(false); }, [html]);
  return <div ref={container} className="pointer-events-none relative aspect-[4/3] overflow-hidden bg-muted" aria-hidden="true">
    {!loaded && <div className="absolute inset-0 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
    <iframe title={title} sandbox="" tabIndex={-1} loading="lazy" referrerPolicy="no-referrer" srcDoc={html} onLoad={() => setLoaded(true)} style={{ transform: `scale(${scale})` }} className="absolute left-0 top-0 h-[1200px] w-[640px] origin-top-left border-0" />
  </div>;
}