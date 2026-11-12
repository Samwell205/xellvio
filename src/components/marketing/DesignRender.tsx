import { useEffect, useRef, useState } from "react";
import { BlockCanvas, type Device } from "@/components/builder/BlockRenderer";
import type { Block, Theme } from "@/lib/builder/schema";

/**
 * Static, non-interactive render of a real block design, scaled to fit its
 * container. Inert: nothing inside can be focused, clicked or submitted.
 */
export function DesignRender({
  blocks,
  theme,
  device = "desktop",
  renderWidth,
  clipHeight,
  label,
  className = "",
}: {
  blocks: Block[];
  theme: Theme;
  device?: Device;
  renderWidth: number;
  clipHeight: number;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / renderWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderWidth]);
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: scale ? clipHeight * scale : undefined, aspectRatio: scale ? undefined : `${renderWidth}/${clipHeight}` }}
    >
      {scale > 0 && (
        <div
          aria-hidden
          // @ts-expect-error inert is a valid DOM attribute in React 19
          inert=""
          className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
          style={{ width: renderWidth, transform: `scale(${scale})` }}
        >
          <BlockCanvas blocks={blocks} theme={theme} device={device} />
        </div>
      )}
    </div>
  );
}

export function BrowserFrame({ url, children, className = "" }: { url: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-card shadow-xl ${className}`}>
      <div aria-hidden className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="ml-2 truncate rounded-md bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{url}</span>
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[30px] border-[6px] border-ink bg-ink shadow-2xl ${className}`}>
      <div className="overflow-hidden rounded-[24px]">{children}</div>
    </div>
  );
}
