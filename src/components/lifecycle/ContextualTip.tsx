import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, X } from "lucide-react";
import { CONTEXTUAL_TIPS } from "@/lib/lifecycle/taxonomy";
import { getSeenTips, markTipSeen } from "@/lib/lifecycle.functions";

/**
 * A one-time hint for an area of the product, shown the first time a workspace
 * opens it and never again once dismissed.
 */
export function ContextualTip({ tip }: { tip: keyof typeof CONTEXTUAL_TIPS }) {
  const load = useServerFn(getSeenTips);
  const mark = useServerFn(markTipSeen);
  const [hidden, setHidden] = useState(false);
  const marked = useRef(false);

  const seen = useQuery({
    queryKey: ["lifecycle-tips"],
    queryFn: () => load() as Promise<string[]>,
    staleTime: 10 * 60_000,
  });

  const alreadySeen = (seen.data ?? []).includes(tip as string);

  useEffect(() => {
    if (seen.isLoading || alreadySeen || marked.current) return;
    marked.current = true;
    mark({ data: { tip: tip as string } }).catch(() => {
      /* guidance is non-critical */
    });
  }, [seen.isLoading, alreadySeen, mark, tip]);

  const content = CONTEXTUAL_TIPS[tip as string];
  if (!content || seen.isLoading || alreadySeen || hidden) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <Lightbulb className="size-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-semibold">{content.title}</div>
        <p className="text-sm text-muted-foreground mt-0.5">{content.body}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss tip"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          setHidden(true);
          mark({ data: { tip: tip as string, dismissed: true } }).catch(() => {});
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
