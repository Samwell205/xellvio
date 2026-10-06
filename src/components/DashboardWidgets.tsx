import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Activity, Sparkles, TrendingUp, Send, MousePointerClick, Mail,
  Check, MessageSquare, UserPlus, AlertTriangle, ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAccountId } from "@/hooks/useAccountId";

async function fetchStats(accountId: string) {
  const { data, error } = await (supabase as any).rpc("dashboard_stats", { p_account: accountId });
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}

/* ─────────────── Activity Log Feed ─────────────── */
export function ActivityLogFeed() {
  const accountId = useAccountId();
  const q = useQuery({
    queryKey: ["dash-activity-log", accountId],
    enabled: !!accountId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,type,created_at")
        .eq("account_id", accountId!)
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const iconFor = (name: string) => {
    if (name.includes("message") || name.includes("sms")) return MessageSquare;
    if (name.includes("delivered") || name.includes("sent")) return Send;
    if (name.includes("click") || name.includes("open")) return MousePointerClick;
    if (name.includes("opt_in") || name.includes("subscribe")) return UserPlus;
    if (name.includes("email")) return Mail;
    if (name.includes("fail") || name.includes("error")) return AlertTriangle;
    return Activity;
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg grid place-items-center bg-primary/10 text-primary">
            <Activity className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Activity log</h3>
            <p className="text-xs text-muted-foreground">Real-time events</p>
          </div>
        </div>
        <Link to="/app/campaigns" className="text-xs text-primary hover:underline">All events →</Link>
      </div>
      {(q.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No events yet. Activity will appear here as your campaigns run.</p>
      ) : (
        <ul className="space-y-3">
          {q.data!.map((e) => {
            const Icon = iconFor(e.type);
            return (
              <li key={e.id} className="flex items-center gap-3">
                <div className="size-8 rounded-md bg-muted grid place-items-center shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium capitalize truncate">{e.type.replace(/_/g, " ")}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ─────────────── Attribution Windows ─────────────── */
export function AttributionCard() {
  const accountId = useAccountId();
  const q = useQuery({
    queryKey: ["dash-attribution", accountId],
    enabled: !!accountId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const d = await fetchStats(accountId!);
      const total = Number(d.sent7 ?? 0);
      const delivered = Number(d.delivered7 ?? 0);
      const failed = Number(d.failed7 ?? 0);
      const deliveryRate = total ? Math.round((delivered / total) * 100) : 0;
      const failureRate = total ? Math.round((failed / total) * 100) : 0;
      return { total, delivered, deliveryRate, failureRate };
    },
  });

  const d = q.data;
  const rows = [
    { l: "Delivery rate", v: `${d?.deliveryRate ?? 0}%`, window: "7 days", active: true },
    { l: "Messages sent", v: String(d?.total ?? 0), window: "7 days" },
    { l: "Failure rate", v: `${d?.failureRate ?? 0}%`, window: "7 days" },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg grid place-items-center bg-success/10 text-success">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Attribution windows</h3>
            <p className="text-xs text-muted-foreground">Performance lookback</p>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2.5">
              <div className="size-4 rounded-sm bg-muted grid place-items-center">
                <Check className="size-3 text-muted-foreground" />
              </div>
              <span className="text-sm">{r.l}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{r.v}</span>
              <span className={`text-xs px-2 py-1 rounded-md ${r.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{r.window}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─────────────── AI Insights ─────────────── */
type Insight = { icon: typeof Sparkles; tone: "primary" | "warning" | "success"; title: string; desc: string; cta?: { label: string; to: string } };

export function AIInsightsCard() {
  const accountId = useAccountId();
  const q = useQuery({
    queryKey: ["dash-ai-insights", accountId],
    enabled: !!accountId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const d = await fetchStats(accountId!);
      return {
        subscribed: Number(d.subscribed ?? 0),
        campaigns: Number(d.campaignsSent7 ?? 0),
        failed: Number(d.failed24 ?? 0),
        optOuts: Number(d.optOuts7 ?? 0),
        recentMessages: Number(d.sent7 ?? 0),
      };
    },
  });

  const d = q.data;
  const insights: Insight[] = [];
  if (d) {
    if (d.subscribed > 0 && d.campaigns === 0) {
      insights.push({
        icon: Sparkles, tone: "primary",
        title: "You have an engaged audience",
        desc: `${d.subscribed} subscribed contacts and no campaigns this week. Launch your first send to drive revenue.`,
        cta: { label: "Create campaign", to: "/app/campaigns/new" },
      });
    }
    if (d.failed > 5) {
      insights.push({
        icon: AlertTriangle, tone: "warning",
        title: "Failure rate is climbing",
        desc: `${d.failed} failed deliveries in the last 24h. Review your sender setup and audience numbers.`,
        cta: { label: "Open setup", to: "/app/setup-sms" },
      });
    }
    if (d.optOuts > 0) {
      insights.push({
        icon: TrendingUp, tone: "warning",
        title: "Opt-outs detected",
        desc: `${d.optOuts} contacts unsubscribed this week. Consider tighter segmentation and lower send frequency.`,
        cta: { label: "Review segments", to: "/app/segments" },
      });
    }
    if (d.recentMessages > 0 && d.campaigns > 0) {
      insights.push({
        icon: Sparkles, tone: "success",
        title: "Try send-time optimization",
        desc: `Your audience engages most in the evening. Schedule your next campaign between 6–8pm local time.`,
        cta: { label: "Schedule send", to: "/app/campaigns/new" },
      });
    }
    if (insights.length === 0) {
      insights.push({
        icon: Sparkles, tone: "primary",
        title: "Grow your subscriber list",
        desc: "Add opt-in keywords and forms to grow your audience and unlock higher-value campaigns.",
        cta: { label: "Open audience", to: "/app/audience" },
      });
    }
  }

  const toneClass = (t: Insight["tone"]) =>
    t === "warning" ? "bg-warning/10 text-warning"
    : t === "success" ? "bg-success/10 text-success"
    : "bg-primary/10 text-primary";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg grid place-items-center bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">AI insights</h3>
            <p className="text-xs text-muted-foreground">Recommended for you</p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {insights.map((ins, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className={`size-9 rounded-md grid place-items-center shrink-0 ${toneClass(ins.tone)}`}>
                <ins.icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{ins.title}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{ins.desc}</div>
                {ins.cta && (
                  <Link to={ins.cta.to} className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    {ins.cta.label} <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
