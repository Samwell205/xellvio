import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { useAccountReadiness } from "@/hooks/use-account-readiness";

export function ReadinessBanner({ compact = false }: { compact?: boolean }) {
  const r = useAccountReadiness();
  if (r.isLoading || r.ready) return null;

  return (
    <Card className="p-5 border-warning/40 bg-warning/5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-warning/15 text-warning-foreground grid place-items-center shrink-0">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Finish setup to start sending</div>
          {!compact && (
            <p className="text-sm text-muted-foreground">
              Complete these steps before you can send SMS or run campaigns.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {r.items.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  {i.done ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className={i.done ? "text-muted-foreground line-through" : "font-medium"}>{i.label}</span>
                </div>
                {!i.done && i.cta && (
                  <Link to={i.cta.to}>
                    <Button size="sm" variant="outline">{i.cta.label}</Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
