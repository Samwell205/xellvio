import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, PartyPopper, Sparkles, X, ArrowRight } from "lucide-react";
import {
  getLifecycle,
  acknowledgeLifecycle,
  acknowledgeMessage,
} from "@/lib/lifecycle.functions";

/**
 * The workspace-facing onboarding surface: welcome, activation checklist with
 * real progress, the first-send celebration, lifecycle messages and contextual
 * next steps. Every value comes from the workspace's own activity.
 */
export function LifecyclePanel() {
  const qc = useQueryClient();
  const load = useServerFn(getLifecycle);
  const ack = useServerFn(acknowledgeLifecycle);
  const ackMessage = useServerFn(acknowledgeMessage);

  const state = useQuery({
    queryKey: ["lifecycle"],
    queryFn: () => load(),
    staleTime: 30_000,
  });

  const acknowledge = useMutation({
    mutationFn: (data: { welcome_seen?: boolean; celebrated?: boolean; snooze_hours?: number }) =>
      ack({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lifecycle"] }),
  });
  const dismissMessage = useMutation({
    mutationFn: (id: string) => ackMessage({ data: { id, action: "dismissed" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lifecycle"] }),
  });

  const s = state.data;
  const remaining = useMemo(() => (s ? s.total - s.completed : 0), [s]);
  if (!s) return null;

  const done = s.completed >= s.total;

  return (
    <div className="space-y-4">
      {s.celebrate_first_send && (
        <Card className="p-5 border-primary/40 bg-primary/5">
          <div className="flex items-start gap-3">
            <PartyPopper className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Your first campaign is on its way 🎉</div>
              <p className="text-sm text-muted-foreground mt-1">
                That's the hardest step done. Open the report to watch delivery in real time.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/campaigns">
                  <Button size="sm">See the report</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => acknowledge.mutate({ celebrated: true })}
                >
                  Got it
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {s.show_welcome && !s.celebrate_first_send && (
        <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Welcome to Xellvio</div>
              <p className="text-sm text-muted-foreground mt-1">
                There are {s.total} short steps between here and your first SMS campaign. We'll keep
                track as you go.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.next && (
                  <Link to={s.next.href as never}>
                    <Button size="sm" onClick={() => acknowledge.mutate({ welcome_seen: true })}>
                      {s.next.label}
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => acknowledge.mutate({ welcome_seen: true })}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!done && !s.checklist_hidden && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold flex items-center gap-2">
                Get set up
                <Badge variant="secondary">{s.stage_label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {remaining} step{remaining === 1 ? "" : "s"} left to your first campaign.
              </p>
            </div>
            <button
              type="button"
              aria-label="Hide setup for now"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => acknowledge.mutate({ snooze_hours: 24 })}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${s.progress}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{s.progress}% complete</div>

          <ul className="mt-4 space-y-1.5">
            {s.checklist.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.href as never}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition hover:bg-muted ${
                    item.done ? "text-muted-foreground" : "font-medium"
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={item.done ? "line-through" : ""}>{item.label}</span>
                  {!item.done && <ArrowRight className="size-3.5 ml-auto text-muted-foreground" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.messages.length > 0 && (
        <div className="space-y-3">
          {s.messages.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{m.title}</div>
                  {m.body && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                      {m.body}
                    </p>
                  )}
                  {m.cta_path && m.cta_label && (
                    <Link to={m.cta_path as never} className="inline-block mt-3">
                      <Button size="sm" variant="outline">
                        {m.cta_label}
                      </Button>
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => dismissMessage.mutate(m.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {s.recommendations.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.recommendations.map((r) => (
            <Card key={r.key} className="p-4 flex flex-col">
              <div className="font-semibold text-sm">{r.title}</div>
              <p className="text-sm text-muted-foreground mt-1 flex-1">{r.body}</p>
              <Link to={r.href as never} className="mt-3">
                <Button size="sm" variant="outline" className="w-full">
                  {r.cta}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
