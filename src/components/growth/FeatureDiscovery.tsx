import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import { featureSuggestions } from "@/lib/growth-tenant.functions";
import { track } from "@/lib/growth/track";

/**
 * Contextual next steps. Only renders when the workspace's own data implies a
 * genuinely useful next action — never a random feature popup.
 */
export function FeatureDiscovery() {
  const { data } = useQuery({
    queryKey: ["feature-suggestions"],
    queryFn: () => featureSuggestions(),
    staleTime: 120_000,
  });

  const suggestions = data ?? [];

  useEffect(() => {
    for (const s of suggestions) {
      track({ event: "feature_suggestion_shown", entity_type: "suggestion", entity_slug: s.key });
    }
  }, [suggestions.map((s) => s.key).join(",")]);

  if (suggestions.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Suggested next steps</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((s) => (
          <div key={s.key} className="rounded-lg border border-border p-3 flex flex-col gap-2">
            <div className="font-medium text-sm">{s.title}</div>
            <p className="text-xs text-muted-foreground flex-1">{s.reason}</p>
            <Button asChild size="sm" variant="secondary" className="w-fit">
              <Link
                to={s.href}
                onClick={() =>
                  track({ event: "feature_suggestion_clicked", entity_type: "suggestion", entity_slug: s.key })
                }
              >
                {s.cta}
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
