import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, AlertTriangle, ShieldOff, Globe,
  Clock, SkipForward, MousePointerClick, Users,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign report — SAMWELL SMS HUB" }] }),
  component: CampaignReport,
});

function CampaignReport() {
  const { id } = Route.useParams();

  const campaignQ = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", id).single()).data,
  });

  const messagesQ = useQuery({
    queryKey: ["campaign-messages", id],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, phone_e164, status, error_code, sent_at, delivered_at, segments_count, country_code, profile:profile_id(country_code, first_name, last_name)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(1000);
      return data ?? [];
    },
  });

  const clicksQ = useQuery({
    queryKey: ["campaign-clicks", id],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages").select("id, events!inner(type)")
        .eq("campaign_id", id).eq("events.type", "clicked");
      return data?.length ?? 0;
    },
  });

  const eligibleQ = useQuery({
    queryKey: ["campaign-eligible", id, campaignQ.data?.audience],
    enabled: !!campaignQ.data,
    queryFn: async () => {
      const { data } = await supabase.rpc("eligible_profile_ids" as any, {
        _account_id: campaignQ.data!.account_id,
        _audience: campaignQ.data!.audience ?? { include: [], exclude: [] },
      });
      return (data as any[])?.length ?? 0;
    },
  });

  const listsQ = useQuery({
    queryKey: ["campaign-lists", id, campaignQ.data?.audience],
    enabled: !!campaignQ.data,
    queryFn: async () => {
      const aud: any = campaignQ.data!.audience ?? {};
      const ids = [...(aud.include ?? []), ...(aud.exclude ?? [])];
      if (ids.length === 0) return { include: [], exclude: [] };
      const { data } = await supabase.from("contact_lists").select("id,name").in("id", ids);
      const byId = new Map((data ?? []).map((l: any) => [l.id, l.name]));
      return {
        include: (aud.include ?? []).map((i: string) => ({ id: i, name: byId.get(i) ?? "Unknown list" })),
        exclude: (aud.exclude ?? []).map((i: string) => ({ id: i, name: byId.get(i) ?? "Unknown list" })),
      };
    },
  });

  const optOutsQ = useQuery({
    queryKey: ["campaign-optouts", id, campaignQ.data?.created_at],
    enabled: !!campaignQ.data,
    queryFn: async () => {
      const since = campaignQ.data!.created_at;
      const { count } = await supabase
        .from("suppressions").select("*", { count: "exact", head: true })
        .eq("reason", "inbound_stop").gte("created_at", since);
      return count ?? 0;
    },
  });

  const stats = useMemo(() => {
    const rows = messagesQ.data ?? [];
    const attempted = eligibleQ.data ?? rows.length;
    const queued = rows.filter((m: any) => m.status === "queued" || m.status === "pending" || m.status === "sending").length;
    const sent = rows.filter((m: any) => ["sent", "delivered", "undelivered", "failed"].includes(m.status)).length;
    const delivered = rows.filter((m: any) => m.status === "delivered").length;
    const failed = rows.filter((m: any) => m.status === "failed" || m.status === "undelivered").length;
    const skipped = Math.max(0, attempted - rows.length);
    const clicked = clicksQ.data ?? 0;
    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

    const byCountry: Record<string, { total: number; delivered: number; failed: number }> = {};
    const failures: Record<string, number> = {};
    for (const m of rows as any[]) {
      const c = m.country_code ?? m.profile?.country_code ?? "—";
      byCountry[c] ??= { total: 0, delivered: 0, failed: 0 };
      byCountry[c].total++;
      if (m.status === "delivered") byCountry[c].delivered++;
      if (m.status === "failed" || m.status === "undelivered") byCountry[c].failed++;
      if ((m.status === "failed" || m.status === "undelivered") && m.error_code) {
        failures[m.error_code] = (failures[m.error_code] ?? 0) + 1;
      }
    }
    return { attempted, queued, sent, delivered, failed, skipped, clicked, deliveryRate, clickRate, byCountry, failures };
  }, [messagesQ.data, eligibleQ.data, clicksQ.data]);

  if (!campaignQ.data) return <div className="text-muted-foreground">Loading campaign…</div>;
  const c = campaignQ.data;
  const sentAt = (messagesQ.data ?? []).find((m: any) => m.sent_at)?.sent_at ?? c.updated_at;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/campaigns" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" /> Campaigns
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
          <div>
            <h1 className="text-2xl font-extrabold">{c.name}</h1>
            <div className="text-sm text-muted-foreground mt-0.5">Text Message · {new Date(sentAt).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <RefreshCw className={`size-3 ${messagesQ.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recipients">Recipient activity</TabsTrigger>
          <TabsTrigger value="links">Link activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-6">
            {/* Phone preview + audience */}
            <div className="space-y-5">
              <Card className="p-5">
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3">Text Message</div>
                <PhonePreview body={c.message_body} />
              </Card>

              <Card className="p-5 space-y-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Included lists and segments</div>
                  {listsQ.data?.include?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {listsQ.data.include.map((l: any) => (
                        <Badge key={l.id} variant="secondary">{l.name} ({stats.attempted})</Badge>
                      ))}
                    </div>
                  ) : <div className="text-sm text-muted-foreground">No included lists</div>}
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Excluded lists and segments</div>
                  {listsQ.data?.exclude?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {listsQ.data.exclude.map((l: any) => (
                        <Badge key={l.id} variant="outline">{l.name}</Badge>
                      ))}
                    </div>
                  ) : <div className="text-sm text-muted-foreground">No excluded lists and segments</div>}
                </div>
              </Card>
            </div>

            {/* Funnel + by-country + failures */}
            <div className="space-y-5">
              <Card className="p-5">
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-4">Recipients</div>
                <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                  <FunnelRow icon={Users} label="attempted" value={stats.attempted} tone="muted" />
                  <FunnelRow icon={SkipForward} label="skipped" value={stats.skipped}
                    sub={stats.attempted ? `${pct(stats.skipped / stats.attempted * 100)} of attempted` : undefined} tone="muted" />
                  <FunnelRow icon={Send} label="sent" value={stats.sent}
                    sub={stats.attempted ? `${pct(stats.sent / stats.attempted * 100)} of attempted` : undefined} tone="primary" />
                  <FunnelRow icon={AlertTriangle} label="failed" value={stats.failed}
                    sub={stats.sent ? `${pct(stats.failed / stats.sent * 100)} of sent` : undefined} tone="danger" />
                  <FunnelRow icon={CheckCircle2} label="delivered" value={stats.delivered}
                    sub={stats.sent ? `${pct(stats.deliveryRate)} of sent` : undefined} tone="success" />
                  <FunnelRow icon={MousePointerClick} label="clicked" value={stats.clicked}
                    sub={stats.delivered ? `${pct(stats.clickRate)} of delivered` : undefined} tone="primary" />
                  <FunnelRow icon={ShieldOff} label="opt-outs (since send)" value={optOutsQ.data ?? 0} tone="danger" />
                  {stats.queued > 0 && (
                    <FunnelRow icon={Clock} label="queued (in-flight)" value={stats.queued} tone="muted" />
                  )}
                </ol>
              </Card>

              <div className="grid md:grid-cols-2 gap-5">
                <Card className="p-5">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
                    <Globe className="size-4" /> By country
                  </div>
                  {Object.keys(stats.byCountry).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No deliveries yet.</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Country</TableHead><TableHead>Total</TableHead>
                        <TableHead>Delivered</TableHead><TableHead>Failed</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {Object.entries(stats.byCountry)
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([cc, v]) => (
                            <TableRow key={cc}>
                              <TableCell><Badge variant="outline">{cc}</Badge></TableCell>
                              <TableCell>{v.total}</TableCell>
                              <TableCell className="text-success">{v.delivered}</TableCell>
                              <TableCell className="text-destructive">{v.failed}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>

                <Card className="p-5">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
                    <AlertTriangle className="size-4" /> Failure reasons
                  </div>
                  {Object.keys(stats.failures).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No failures.</div>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {Object.entries(stats.failures)
                        .sort((a, b) => b[1] - a[1])
                        .map(([code, n]) => (
                          <li key={code} className="flex items-center justify-between border-b pb-1.5">
                            <span className="font-mono text-xs">Twilio code {code}</span>
                            <Badge variant="outline" className="text-destructive border-destructive/30">{n}</Badge>
                          </li>
                        ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recipients" className="mt-5">
          <Card className="p-4">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Phone</TableHead><TableHead>Country</TableHead>
                  <TableHead>Status</TableHead><TableHead>Error</TableHead><TableHead>Sent</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(messagesQ.data ?? []).slice(0, 200).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.phone_e164}</TableCell>
                      <TableCell>{m.country_code ?? m.profile?.country_code ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-xs text-destructive">{m.error_code ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(messagesQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No messages yet — the dispatcher runs every minute.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="links" className="mt-5">
          <Card className="p-5 text-sm text-muted-foreground">
            {stats.clicked > 0
              ? `${stats.clicked} click${stats.clicked === 1 ? "" : "s"} recorded — ${pct(stats.clickRate)} of delivered.`
              : "No link clicks recorded yet."}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

function FunnelRow({
  icon: Icon, label, value, sub, tone,
}: {
  icon: any; label: string; value: number; sub?: string;
  tone: "success" | "danger" | "primary" | "muted";
}) {
  const ring =
    tone === "success" ? "bg-success/10 text-success" :
    tone === "danger" ? "bg-destructive/10 text-destructive" :
    tone === "primary" ? "bg-primary/10 text-primary" :
    "bg-muted text-muted-foreground";
  return (
    <li className="relative pl-10">
      <span className={`absolute left-0 top-0 size-8 rounded-full grid place-items-center ${ring}`}>
        <Icon className="size-4" />
      </span>
      <div className="font-semibold text-lg leading-tight">{value.toLocaleString()} {label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </li>
  );
}

function PhonePreview({ body }: { body: string }) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border bg-muted/30 p-3 shadow-inner">
      <div className="rounded-[1.5rem] bg-background border overflow-hidden">
        <div className="h-7 bg-muted/40 flex items-center justify-center">
          <div className="w-16 h-3 rounded-full bg-foreground/80" />
        </div>
        <div className="p-4 min-h-[280px]">
          <div className="text-[10px] text-muted-foreground text-center mb-3">Text Message</div>
          <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 text-sm whitespace-pre-wrap leading-snug max-w-[85%]">
            {body || <span className="text-muted-foreground italic">(empty message)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
