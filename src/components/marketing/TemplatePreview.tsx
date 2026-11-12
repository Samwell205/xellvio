import { useEffect, useRef, useState } from "react";
import { BlockCanvas } from "@/components/builder/BlockRenderer";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";
import { previewFor, type TemplateCategory } from "@/lib/marketing/template-catalog";
import { FlowDiagram } from "./FlowDiagram";

/* Card thumbnail rendered from the same template data the detail page's
   "Live preview" uses, so the thumbnail always matches what opens. */

const SCALE = 0.38;

export function TemplatePreview({ category, slug, label }: { category: TemplateCategory; slug: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setVisible(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const page = category !== "automations" ? previewFor(category, slug) : undefined;
  const flow = category === "automations" ? AUTOMATION_TEMPLATES.find((a) => a.id === slug) : undefined;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Preview of the ${label} template`}
      className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted/40"
    >
      {visible && page && (
        <div aria-hidden className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: `${100 / SCALE}%`, transform: `scale(${SCALE})` }}>
          <BlockCanvas blocks={page.blocks} theme={page.theme} />
        </div>
      )}
      {flow && (
        <div aria-hidden className="absolute inset-0 p-3" style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
          <FlowDiagram flow={flow} className="h-full w-full" />
        </div>
      )}
    </div>
  );
}
