import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Megaphone, CheckCircle2, RefreshCw, Send, AlertTriangle, XCircle, UserMinus, Bell, Building2, ArrowRight } from "lucide-react";
import { ActivityLogFeed, AttributionCard, AIInsightsCard } from "@/components/DashboardWidgets";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — Xellio" }] }),
  component: Overview,
});

function OnboardingBanner() {
  const account = useQuery({
    queryKey: ["account", "onboarding-status"],
    queryFn: async () => (await supabase.from("accounts").select("onboarding_status").maybeSingle()).data,
  });
  const senders = useQuery({
    queryKey: ["sender-assets-banner"],
    queryFn: async () => (await supabase.from("sender_assets").select("verification_status,country_code,phone_number,friendly_rejection_reason").order("created_at", { ascending: false })).data ?? [],
  });
  const status = account.data?.onboarding_status;
  if (status === "suspended") {
    return (
      <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
        <AlertTriangle className="size-5 text-destructive" />
        <div className="flex-1">
          <div className="font-semibold text-destructive">Account suspended</div>
          <div className="text-sm text-muted-foreground">Sending has been halted by the platform administrator. Contact support to restore access.</div>
        </div>
      </Card>
    );
  }
  const list = senders.data ?? [];
  const verified = list.find((s) => s.verification_status === "verified");
  const pending = list.find((s) => s.verification_status === "submitted" || s.verification_status === "in_review");
  const rejected = list.find((s) => s.verification_status === "rejected");

  if (verified) return null;
  if (rejected) {
    return (
      <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
        <AlertTriangle className="size-5 text-destructive" />
        <div className="flex-1">
          <div className="font-semibold">We need a bit more info</div>
          <div className="text-sm text-muted-foreground">{rejected.friendly_rejection_reason ?? "Please update your details and try again."}</div>
        </div>
        <Link to="/app/setup-sms"><Button size="sm">Fix and resubmit</Button></Link>
      </Card>
    );
  }
  if (pending) {
    return (
      <Card className="p-4 border-primary/40 bg-primary/5 flex items-center gap-3">
        <Building2 className="size-5 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">Setting up your SMS number</div>
          <div className="text-sm text-muted-foreground">This usually takes 7–10 business days. You can keep building campaigns in the meantime.</div>
        </div>
        <Link to="/app/setup-sms"><Button size="sm" variant="outline">View status</Button></Link>
      </Card>
    );
  }
  return (
    <Card className="p-4 border-primary/40 bg-primary/5 flex items-center gap-3">
      <Building2 className="size-5 text-primary" />
      <div className="flex-1">
        <div className="font-semibold">Set up SMS</div>
        <div className="text-sm text-muted-foreground">Get your sender number in a few clicks — we handle the rest.</div>
      </div>
      <Link to="/app/setup-sms"><Button size="sm">Get started <ArrowRight className="size-4 ml-1.5" /></Button></Link>
    </Card>
  );
}

function Overview() {
  const stats = useQuery({
    queryKey: ["dash-stats"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [
        { count: subscribed },
        { count: campaignsSent },
        { count: delivered },
        { count: totalMessages },
      ] = await Promise.all([
        supabase.from("consents").select("*", { count: "exact", head: true }).eq("status", "subscribed"),
        supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "delivered"),
        supabase.from("messages").select("*", { count: "exact", head: true }),
      ]);
      const rate = totalMessages && totalMessages > 0 ? Math.round(((delivered ?? 0) / totalMessages) * 100) : 0;
      return { subscribed: subscribed ?? 0, campaignsSent: campaignsSent ?? 0, deliveryRate: rate, delivered: delivered ?? 0 };
    },
  });

  const s = stats.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            High-level performance.
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <RefreshCw className={`size-3 ${stats.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </p>
        </div>
        <Link to="/app/campaigns"><Button><Megaphone className="size-4 mr-1.5" />Campaigns</Button></Link>
      </div>


      <OnboardingBanner />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Subscribed contacts" value={s?.subscribed ?? 0} />
        <Stat icon={Megaphone} label="Campaigns sent" value={s?.campaignsSent ?? 0} />
        <Stat icon={CheckCircle2} label="Delivery rate" value={`${s?.deliveryRate ?? 0}%`} tone="success" />
        <Stat icon={Send} label="Messages delivered" value={s?.delivered ?? 0} />
      </div>

      <DeliveryAlerts />

      <div className="grid lg:grid-cols-3 gap-4">
        <ActivityLogFeed />
        <AttributionCard />
        <AIInsightsCard />
      </div>

      <RecentCampaigns />
    </div>
  );
}

function DeliveryAlerts() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const alerts = useQuery({
    queryKey: ["dash-delivery-alerts"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [failedRes, undelRes, optOutRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id,campaign_id,phone_e164,status,error_code,created_at,rendered_body")
          .eq("status", "failed")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("messages")
          .select("id,campaign_id,phone_e164,status,error_code,created_at,rendered_body")
          .eq("status", "undelivered")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("consents")
          .select("id,profile_id,status,updated_at,source")
          .eq("status", "unsubscribed")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);
      return {
        failed: failedRes.data ?? [],
        undelivered: undelRes.data ?? [],
        optOuts: optOutRes.data ?? [],
      };
    },
  });

  const failed = alerts.data?.failed ?? [];
  const undelivered = alerts.data?.undelivered ?? [];
  const optOuts = alerts.data?.optOuts ?? [];
  const total = failed.length + undelivered.length + optOuts.length;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg grid place-items-center bg-warning/10 text-warning">
            <Bell className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Delivery alerts</h3>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </div>
        </div>
        {total > 0 ? (
          <Badge variant="destructive" className="rounded-full">{total} new</Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full">All clear</Badge>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <AlertStat icon={XCircle} label="Failed" value={failed.length} tone="destructive" />
        <AlertStat icon={AlertTriangle} label="Undelivered" value={undelivered.length} tone="warning" />
        <AlertStat icon={UserMinus} label="Opt-outs" value={optOuts.length} tone="muted" />
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No delivery issues or opt-outs in the last 24 hours.</p>
      ) : (
        <ul className="divide-y">
          {failed.slice(0, 5).map((m) => (
            <AlertRow
              key={`f-${m.id}`}
              icon={XCircle}
              tone="destructive"
              title={`Failed → ${m.phone_e164}`}
              subtitle={m.error_code ? `Twilio error ${m.error_code}` : "Provider rejected message"}
              when={m.created_at}
              href={m.campaign_id}
            />
          ))}
          {undelivered.slice(0, 5).map((m) => (
            <AlertRow
              key={`u-${m.id}`}
              icon={AlertTriangle}
              tone="warning"
              title={`Undelivered → ${m.phone_e164}`}
              subtitle={m.error_code ? `Twilio error ${m.error_code}` : "Carrier did not deliver"}
              when={m.created_at}
              href={m.campaign_id}
            />
          ))}
          {optOuts.slice(0, 5).map((c) => (
            <AlertRow
              key={`o-${c.id}`}
              icon={UserMinus}
              tone="muted"
              title="Contact opted out"
              subtitle={c.source ? `Source: ${c.source}` : "Replied STOP"}
              when={c.updated_at}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AlertStat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "destructive" | "warning" | "muted" }) {
  const styles =
    tone === "destructive"
      ? "text-destructive bg-destructive/10"
      : tone === "warning"
      ? "text-warning bg-warning/10"
      : "text-muted-foreground bg-muted";
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className={`size-9 rounded-md grid place-items-center ${styles}`}>
        <Icon className="size-4" />
      </div>
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

function AlertRow({ icon: Icon, tone, title, subtitle, when, href }: { icon: React.ComponentType<{ className?: string }>; tone: "destructive" | "warning" | "muted"; title: string; subtitle: string; when: string; href?: string }) {
  const color =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  const content = (
    <div className="py-2.5 flex items-start gap-3">
      <Icon className={`size-4 mt-0.5 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(when)}</div>
    </div>
  );
  if (href) {
    return (
      <li>
        <Link to="/app/campaigns/$id" params={{ id: href }} className="block hover:bg-muted/40 -mx-2 px-2 rounded">
          {content}
        </Link>
      </li>
    );
  }
  return <li>{content}</li>;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RecentCampaigns() {
  const q = useQuery({
    queryKey: ["dash-recent-campaigns"],
    refetchInterval: 10_000,
    queryFn: async () =>
      (await supabase.from("campaigns").select("id,name,status,created_at,schedule_at").order("created_at", { ascending: false }).limit(5)).data ?? [],
  });
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Recent campaigns</h3>
        <Link to="/app/campaigns" className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      {(q.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No campaigns yet. Create your first one.</p>
      ) : (
        <ul className="divide-y">
          {q.data!.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between">
              <Link to="/app/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.name}</Link>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="capitalize">{c.status}</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; tone?: "success" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
