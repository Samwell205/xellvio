import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcileCampaignMessages } from "@/lib/reconcile-messages.functions";
import {
  cancelCampaign,
  retryMessage,
  retryFailedMessages,
  resendUnconfirmed,
} from "@/lib/campaign-control.functions";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, AlertTriangle, ShieldOff, Globe,
  Clock, SkipForward, MousePointerClick, Users, Sparkles, TrendingUp, Smartphone, HelpCircle,
  DollarSign, Wallet, Activity, XCircle, Download, RotateCw, ExternalLink,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { formatUSD } from "@/lib/money";


export const Route = createFileRoute("/_authenticated/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign report — Xellvio" }] }),
  component: CampaignReport,
});

function CampaignReport() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const reconcileFn = useServerFn(reconcileCampaignMessages);
  const reconcileM = useMutation({
    mutationFn: () => reconcileFn({ data: { campaignId: id } }),
    onSuccess: (r) => {
      toast.success(
        r.updated > 0
          ? `Refreshed ${r.updated} of ${r.checked} pending message${r.checked === 1 ? "" : "s"}.`
          : r.checked > 0
            ? `Checked ${r.checked} pending message${r.checked === 1 ? "" : "s"} — no new delivery receipt yet.`
            : "No pending messages to refresh.",
      );
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-events", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh delivery statuses"),
  });

  const campaignQ = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", id).single()).data,
  });

  const messagesQ = useQuery({
    queryKey: ["campaign-messages", id],
    // Realtime keeps this in sync; polling is a safety net in case a WS event is missed.
    refetchInterval: 30_000,
    queryFn: async () => {
      // Page through all rows so large campaigns don't get truncated stats.
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      // Safety cap at 50k rows.
      while (from < 50_000) {
        const { data, error } = await supabase
          .from("messages")
          .select("id, phone_e164, status, error_code, sent_at, delivered_at, created_at, segments_count, country_code, cost, profile:profile_id(country_code, first_name, last_name)")
          .eq("campaign_id", id)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["campaign-events", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, type, created_at, message_id, messages!inner(campaign_id)")
        .eq("messages.campaign_id", id)
        .limit(2000);
      return data ?? [];
    },
  });

  // Live progress counts across the full campaign. Realtime pushes updates
  // whenever a message row changes; the interval below is a fallback.
  const progressQ = useQuery({
    queryKey: ["campaign-progress", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const base = () =>
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", id);
      // "Sent" = handed to carrier and NO error yet. "Failed" includes
      // status=failed/undelivered PLUS rows that Twilio marked `sent` with an
      // error code (carrier rejection / silent DLR failure) — those are not
      // real deliveries and should not inflate the Sent bucket.
      const [total, queued, sending, sentClean, sentErr, delivered, unconfirmed, failedRaw] = await Promise.all([
        base(),
        base().in("status", ["queued", "pending"]),
        base().eq("status", "sending"),
        base().eq("status", "sent").is("error_code", null),
        base().eq("status", "sent").not("error_code", "is", null),
        base().eq("status", "delivered"),
        base().eq("status", "delivery_unconfirmed"),
        base().in("status", ["failed", "undelivered"]),
      ]);
      return {
        total: total.count ?? 0,
        queued: queued.count ?? 0,
        sending: sending.count ?? 0,
        sent: sentClean.count ?? 0,
        delivered: delivered.count ?? 0,
        deliveryUnconfirmed: unconfirmed.count ?? 0,
        failed: (failedRaw.count ?? 0) + (sentErr.count ?? 0),
      };
    },
  });


  // Failure breakdown by error_code (drives the "Failure reasons" panel and
  // the per-reason retry button). Sender/provider is inferred from
  // sender_map on the campaign.
  const failuresQ = useQuery({
    queryKey: ["campaign-failures", id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("error_code, country_code")
        .eq("campaign_id", id)
        .in("status", ["failed", "undelivered"])
        .limit(5000);
      const byReason: Record<string, number> = {};
      const byCountry: Record<string, number> = {};
      for (const r of data ?? []) {
        const code = (r as any).error_code ?? "unknown";
        byReason[code] = (byReason[code] ?? 0) + 1;
        const cc = (r as any).country_code ?? "—";
        byCountry[cc] = (byCountry[cc] ?? 0) + 1;
      }
      return { byReason, byCountry, total: data?.length ?? 0 };
    },
  });

  // Realtime: subscribe to message + campaign changes and invalidate the
  // relevant queries. This gives sub-second UI updates instead of waiting
  // for the polling interval.
  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `campaign_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
          queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
          queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["campaign", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const cancelFn = useServerFn(cancelCampaign);
  const cancelM = useMutation({
    mutationFn: () => cancelFn({ data: { campaignId: id } }),
    onSuccess: (r) => {
      toast.success(
        r.alreadyStopped
          ? "Campaign was already stopped."
          : `Campaign cancelled. ${r.cancelledMessages.toLocaleString()} queued message${
              r.cancelledMessages === 1 ? "" : "s"
            } will not be sent.`,
      );
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel campaign"),
  });

  const retryOneFn = useServerFn(retryMessage);
  const retryOneM = useMutation({
    mutationFn: (messageId: string) => retryOneFn({ data: { messageId } }),
    onSuccess: () => {
      toast.success("Message re-queued.");
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const retryAllFn = useServerFn(retryFailedMessages);
  const retryAllM = useMutation({
    mutationFn: (errorCode?: string | null) =>
      retryAllFn({ data: { campaignId: id, errorCode: errorCode ?? null } }),
    onSuccess: (r) => {
      toast.success(`Re-queued ${r.retried.toLocaleString()} failed message${r.retried === 1 ? "" : "s"}.`);
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const resendUnconfirmedFn = useServerFn(resendUnconfirmed);
  const resendUnconfirmedM = useMutation({
    mutationFn: (hoursBack: number) =>
      resendUnconfirmedFn({ data: { campaignId: id, hoursBack } }),
    onSuccess: (r: any) => {
      toast.success(
        r.resent > 0
          ? `Re-queued ${r.resent.toLocaleString()} unconfirmed message${r.resent === 1 ? "" : "s"} (est. ${formatUSD(r.estimatedCost)}).`
          : "No unconfirmed messages in that window.",
      );
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Resend failed"),
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
    const events = eventsQ.data ?? [];
    const progress = progressQ.data;
    // Prefer the accurate progress count (server-side count) over the eligible
    // audience estimate or a possibly-truncated messages page.
    const attempted = Math.max(
      progress?.total ?? 0,
      rows.length,
      eligibleQ.data ?? 0,
    );
    const queued = progress
      ? progress.queued + progress.sending
      : rows.filter((m: any) => ["queued", "pending", "sending"].includes(m.status)).length;
    const awaitingDelivery = progress
      ? progress.sent
      : rows.filter((m: any) => m.status === "sent" && !m.error_code).length;
    const delivered = progress
      ? progress.delivered
      : rows.filter((m: any) => m.status === "delivered").length;
    const deliveryUnconfirmed = progress
      ? progress.deliveryUnconfirmed
      : rows.filter((m: any) => m.status === "delivery_unconfirmed").length;
    const failed = progress
      ? progress.failed
      : rows.filter((m: any) => m.status === "failed" || m.status === "undelivered" || (m.status === "sent" && m.error_code)).length;
    const sent = awaitingDelivery + delivered + deliveryUnconfirmed + failed;
    const skippedRows = rows.filter((m: any) => m.status === "skipped" || m.error_code === "insufficient_balance").length;
    const skipped = Math.max(skippedRows, attempted - Math.max(progress?.total ?? 0, rows.length));
    const clicked = events.filter((e: any) => e.type === "clicked").length;
    const uniqueClickers = new Set(events.filter((e: any) => e.type === "clicked").map((e: any) => e.message_id)).size;
    const totalCost = rows.reduce((s: number, m: any) => s + Number(m.cost ?? 0), 0);
    const totalSegments = rows.reduce((s: number, m: any) => s + Number(m.segments_count ?? 1), 0);
    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const clickRate = delivered > 0 ? (uniqueClickers / delivered) * 100 : 0;
    const costPerDelivered = delivered > 0 ? totalCost / delivered : 0;

    const byCountry: Record<string, { total: number; delivered: number; unconfirmed: number; failed: number }> = {};
    const failures: Record<string, number> = {};
    for (const m of rows as any[]) {
      const c = m.country_code ?? m.profile?.country_code ?? "—";
      byCountry[c] ??= { total: 0, delivered: 0, unconfirmed: 0, failed: 0 };
      byCountry[c].total++;
      if (m.status === "delivered") byCountry[c].delivered++;
      if (m.status === "delivery_unconfirmed") byCountry[c].unconfirmed++;
      if (m.status === "failed" || m.status === "undelivered") byCountry[c].failed++;
      if ((m.status === "failed" || m.status === "undelivered") && m.error_code) {
        failures[m.error_code] = (failures[m.error_code] ?? 0) + 1;
      }
    }


    // Time series — cumulative by hour so the chart never appears to "drop"
    // completed deliveries back to zero after the last webhook hour.
    const points = new Map<number, { t: number; sent: number; delivered: number; clicked: number }>();
    const bucket = (iso: string | null) => {
      if (!iso) return null;
      const d = new Date(iso); d.setMinutes(0, 0, 0); return d.getTime();
    };
    for (const m of rows as any[]) {
      const ts = bucket(m.sent_at);
      if (ts) { points.set(ts, points.get(ts) ?? { t: ts, sent: 0, delivered: 0, clicked: 0 }); points.get(ts)!.sent++; }
      const td = bucket(m.delivered_at);
      if (td) { points.set(td, points.get(td) ?? { t: td, sent: 0, delivered: 0, clicked: 0 }); points.get(td)!.delivered++; }
    }
    for (const e of events as any[]) {
      if (e.type !== "clicked") continue;
      const tc = bucket(e.created_at);
      if (tc) { points.set(tc, points.get(tc) ?? { t: tc, sent: 0, delivered: 0, clicked: 0 }); points.get(tc)!.clicked++; }
    }
    let sentRunning = 0;
    let deliveredRunning = 0;
    let clickedRunning = 0;
    const series = [...points.values()].sort((a, b) => a.t - b.t).map((p) => {
      sentRunning += p.sent;
      deliveredRunning += p.delivered;
      clickedRunning += p.clicked;
      return {
      t: p.t,
      sent: sentRunning,
      delivered: deliveredRunning,
      clicked: clickedRunning,
      label: new Date(p.t).toLocaleTimeString([], { hour: "numeric", hour12: true }),
    };
    });

    return {
      attempted, queued, sent, awaitingDelivery, delivered, deliveryUnconfirmed, failed, skipped, clicked, uniqueClickers,
      totalCost, totalSegments, deliveryRate, clickRate, costPerDelivered,
      byCountry, failures, series,
    };
  }, [messagesQ.data, eventsQ.data, eligibleQ.data, progressQ.data]);

  if (!campaignQ.data) return <div className="text-muted-foreground">Loading campaign…</div>;
  const c = campaignQ.data;
  const sentAt = (messagesQ.data ?? []).find((m: any) => m.sent_at)?.sent_at ?? c.updated_at;

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => reconcileM.mutate()}
              disabled={reconcileM.isPending}
              title="Fetch the latest carrier delivery status for messages still marked as sent or queued."
            >
              <RefreshCw className={`size-3 mr-1 ${reconcileM.isPending ? "animate-spin" : ""}`} />
              {reconcileM.isPending ? "Refreshing…" : "Refresh statuses"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportProgressCsv({
                  campaign: c,
                  progress: progressQ.data,
                  failures: failuresQ.data,
                  messages: messagesQ.data ?? [],
                })
              }
              title="Download queued / sending / delivered / failed metrics as CSV."
            >
              <Download className="size-3 mr-1" />
              Export CSV
            </Button>
            {!["sent", "cancelled", "failed"].includes(c.status) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelM.isPending}
                    title="Stop further dispatch. Already-delivered messages are not affected."
                  >
                    <XCircle className="size-3 mr-1" />
                    {cancelM.isPending ? "Cancelling…" : "Cancel campaign"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      No further messages will be sent. Messages that have already been
                      handed to the carrier will still be delivered — those cannot be
                      recalled. You will not be charged for any queued messages that are
                      cancelled.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep sending</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelM.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, cancel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {/* Provider portal link removed — tenants shouldn't see upstream provider */}
            <Button asChild variant="outline" size="sm">
              <Link to="/app/campaigns/new" search={{ from: id } as any}>View campaign</Link>
            </Button>

          </div>
        </div>
      </div>

      {c.status === "paused_low_balance" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <RefreshCw className="size-5 text-amber-600 animate-spin shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <div className="font-semibold mb-1">Your campaign is processing</div>
            <div>
              {c.paused_reason ??
                "We're temporarily waiting for platform capacity — your messages will start sending automatically within a few minutes."}
            </div>
            <div className="text-xs mt-1 opacity-80">You haven't been charged for any un-sent messages.</div>
          </div>
        </div>
      )}

      {c.status === "cancelled" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-0.5">Campaign cancelled</div>
            <div className="text-muted-foreground">
              Dispatch is stopped. Messages already handed to the carrier will still be delivered.
            </div>
          </div>
        </div>
      )}

      <ProgressPanel
        data={progressQ.data}
        status={c.status}
        isFetching={progressQ.isFetching}
        failures={failuresQ.data}
        onRetryReason={(code) => retryAllM.mutate(code)}
        onRetryAll={() => retryAllM.mutate(null)}
        isRetrying={retryAllM.isPending}
      />




      <Tabs defaultValue="overview">

        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recipients">Recipient activity</TabsTrigger>
          <TabsTrigger value="links">Link activity</TabsTrigger>
          <TabsTrigger value="cost">Cost & deliverability</TabsTrigger>
        </TabsList>

        {/* ───────────── OVERVIEW ───────────── */}
        <TabsContent value="overview" className="mt-5">
          <div className="grid lg:grid-cols-[minmax(0,320px)_1fr] gap-6">
            {/* Phone + audience */}
            <div className="space-y-5">
              <Card className="p-5">
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3">Text Message</div>
                <PhonePreview body={c.message_body} mediaUrl={c.media_url} />
              </Card>

              <Card className="p-5 space-y-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Included lists & segments</div>
                  {listsQ.data?.include?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {listsQ.data.include.map((l: any) => (
                        <Badge key={l.id} variant="secondary">{l.name} · {stats.attempted}</Badge>
                      ))}
                    </div>
                  ) : <div className="text-sm text-muted-foreground">No included lists</div>}
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Excluded</div>
                  {listsQ.data?.exclude?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {listsQ.data.exclude.map((l: any) => (
                        <Badge key={l.id} variant="outline">{l.name}</Badge>
                      ))}
                    </div>
                  ) : <div className="text-sm text-muted-foreground">No exclusions</div>}
                </div>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* KPI hero */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <Kpi icon={CheckCircle2} label="Delivery rate" value={`${stats.deliveryRate.toFixed(1)}%`}
                  sub={`${stats.delivered.toLocaleString()} of ${stats.sent.toLocaleString()} handed to carrier`} tone="success" />
                <Kpi icon={Clock} label="Awaiting carrier" value={stats.awaitingDelivery.toLocaleString()}
                  sub="accepted, no final receipt yet" tone="muted" />
                <UnconfirmedKpi
                  value={stats.deliveryUnconfirmed}
                  sent={stats.sent}
                  onResend={(h) => resendUnconfirmedM.mutate(h)}
                  isResending={resendUnconfirmedM.isPending}
                  canResend={campaignQ.data?.status !== "cancelled" && stats.deliveryUnconfirmed > 0}
                />

                <Kpi icon={MousePointerClick} label="Click rate" value={`${stats.clickRate.toFixed(1)}%`}
                  sub={`${stats.uniqueClickers} unique clicker${stats.uniqueClickers === 1 ? "" : "s"}`} tone="primary" />
                <Kpi icon={ShieldOff} label="Opt-outs" value={(optOutsQ.data ?? 0).toLocaleString()}
                  sub="since campaign send" tone="danger" />
                <Kpi icon={Wallet} label="Spend" value={formatUSD(stats.totalCost)}
                  sub={`${stats.totalSegments.toLocaleString()} segments`} tone="muted" />
              </div>

              {/* Engagement over time */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold flex items-center gap-2"><Activity className="size-4 text-primary" /> Engagement over time</div>
                    <div className="text-xs text-muted-foreground">Sent, delivered and clicked, cumulative by hour</div>
                  </div>
                </div>
                {stats.series.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ChartContainer
                    config={{
                      sent:      { label: "Sent",      color: "hsl(217 91% 60%)" },
                      delivered: { label: "Delivered", color: "hsl(142 71% 45%)" },
                      clicked:   { label: "Clicked",   color: "hsl(38 92% 50%)" },
                    }}
                    className="h-[260px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="g-sent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="g-del" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="g-clk" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} className="text-xs" width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area type="monotone" dataKey="sent"      stroke="hsl(217 91% 60%)" fill="url(#g-sent)" strokeWidth={2} />
                        <Area type="monotone" dataKey="delivered" stroke="hsl(142 71% 45%)" fill="url(#g-del)"  strokeWidth={2} />
                        <Area type="monotone" dataKey="clicked"   stroke="hsl(38 92% 50%)"  fill="url(#g-clk)"  strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </Card>

              {/* Funnel */}
              <Card className="p-5">
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-4 flex items-center gap-1">
                  <TrendingUp className="size-4" /> Recipient funnel
                </div>
                <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                  <FunnelRow icon={Users} label="attempted" value={stats.attempted} tone="muted" />
                  <FunnelRow icon={SkipForward} label="skipped" value={stats.skipped}
                    sub={stats.attempted ? `${pct(stats.skipped / stats.attempted * 100)} of attempted` : undefined} tone="muted" />
                  <FunnelRow icon={Send} label="sent to carrier" value={stats.sent}
                    sub={stats.attempted ? `${pct(stats.sent / stats.attempted * 100)} of attempted` : undefined} tone="primary" />
                  {stats.awaitingDelivery > 0 && (
                    <FunnelRow icon={Clock} label="awaiting carrier report" value={stats.awaitingDelivery}
                      sub={stats.sent ? `${pct(stats.awaitingDelivery / stats.sent * 100)} of sent` : undefined} tone="muted" />
                  )}
                  {stats.deliveryUnconfirmed > 0 && (
                    <FunnelRow icon={HelpCircle} label="delivery unconfirmed" value={stats.deliveryUnconfirmed}
                      sub={stats.sent ? `${pct(stats.deliveryUnconfirmed / stats.sent * 100)} of sent` : undefined} tone="muted" />
                  )}
                  <FunnelRow icon={AlertTriangle} label="failed" value={stats.failed}
                    sub={stats.sent ? `${pct(stats.failed / stats.sent * 100)} of sent` : undefined} tone="danger" />
                  <FunnelRow icon={CheckCircle2} label="delivered" value={stats.delivered}
                    sub={stats.sent ? `${pct(stats.deliveryRate)} of sent` : undefined} tone="success" />
                  <FunnelRow icon={MousePointerClick} label="clicked" value={stats.uniqueClickers}
                    sub={stats.delivered ? `${pct(stats.clickRate)} of delivered` : undefined} tone="primary" />
                  <FunnelRow icon={ShieldOff} label="opt-outs (since send)" value={optOutsQ.data ?? 0} tone="danger" />
                  {stats.queued > 0 && (
                    <FunnelRow icon={Clock} label="queued (in-flight)" value={stats.queued} tone="muted" />
                  )}
                </ol>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ───────────── RECIPIENTS ───────────── */}
        <TabsContent value="recipients" className="mt-5">
          <RecipientActivity
            rows={messagesQ.data ?? []}
            stats={stats}
            optOuts={optOutsQ.data ?? 0}
            onRetry={(mid) => retryOneM.mutate(mid)}
            retryingId={retryOneM.isPending ? (retryOneM.variables as string | undefined) : undefined}
            canRetry={c.status !== "cancelled"}
          />

        </TabsContent>

        {/* ───────────── LINKS ───────────── */}
        <TabsContent value="links" className="mt-5">
          <LinkActivity
            uniqueClickers={stats.uniqueClickers}
            totalClicks={stats.clicked}
            delivered={stats.delivered}
            clicks={(eventsQ.data ?? []).filter((e: any) => e.type === "clicked")}
          />
        </TabsContent>

        {/* ───────────── COST & DELIVERABILITY ───────────── */}
        <TabsContent value="cost" className="mt-5">
          <div className="grid lg:grid-cols-3 gap-5">
            <Card className="p-5">
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
                <DollarSign className="size-4" /> Cost summary
              </div>
              <div className="space-y-3">
                <Stat label="Total spend" value={formatUSD(stats.totalCost)} />
                <Stat label="Segments sent" value={stats.totalSegments.toLocaleString()} />
                <Stat label="Cost / delivered" value={formatUSD(stats.costPerDelivered)} />
                <Stat label="Cost / message" value={formatUSD(stats.sent > 0 ? stats.totalCost / stats.sent : 0)} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
                <Globe className="size-4" /> Performance by country
              </div>
              {Object.keys(stats.byCountry).length === 0 ? (
                <div className="text-sm text-muted-foreground">No deliveries yet.</div>
              ) : (
                <ul className="space-y-3">
                  {Object.entries(stats.byCountry).sort((a, b) => b[1].total - a[1].total).map(([cc, v]) => {
                    const rate = v.total ? (v.delivered / v.total) * 100 : 0;
                    const uncRate = v.total ? (v.unconfirmed / v.total) * 100 : 0;
                    const failRate = v.total ? (v.failed / v.total) * 100 : 0;
                    return (
                      <li key={cc} className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">{cc} · {v.total.toLocaleString()}</span>
                          <span className="text-muted-foreground tabular-nums">{rate.toFixed(0)}% delivered</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                          <div className="h-full bg-success" style={{ width: `${rate}%` }} />
                          <div className="h-full bg-cyan-500" style={{ width: `${uncRate}%` }} />
                          <div className="h-full bg-destructive" style={{ width: `${failRate}%` }} />
                        </div>
                        {v.unconfirmed > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                            {v.unconfirmed.toLocaleString()} unconfirmed · {v.failed.toLocaleString()} failed
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

              )}
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1">
                <AlertTriangle className="size-4" /> Failure reasons
              </div>
              {Object.keys(stats.failures).length === 0 ? (
                <div className="text-sm text-muted-foreground">No failures recorded.</div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {Object.entries(stats.failures).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                    <li key={code} className="flex items-center justify-between border-b pb-1.5">
                      <span className="font-mono text-xs">{code}</span>
                      <Badge variant="outline" className="text-destructive border-destructive/30">{n}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-5 mt-5 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center"><Sparkles className="size-4" /></div>
              <div className="text-sm">
                <div className="font-semibold mb-1">Deliverability tip</div>
                <p className="text-muted-foreground">
                  Carriers throttle traffic with low engagement. Keep delivery {">"} 95%, click rate {">"} 3%, and opt-outs {"<"} 1% to stay in the good-sender lane.
                  Messages skipped for insufficient balance are <strong>never charged</strong> — top up to retry.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────── Sub-components ───────────── */

function RecipientActivity({
  rows,
  stats,
  optOuts,
  onRetry,
  retryingId,
  canRetry,
}: {
  rows: any[];
  stats: any;
  optOuts: number;
  onRetry?: (messageId: string) => void;
  retryingId?: string;
  canRetry?: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");
  const buckets = useMemo(() => {
    const f = {
      all: rows,
      sent: rows.filter((m) => m.status === "sent"),
      delivered: rows.filter((m) => m.status === "delivered"),
      unconfirmed: rows.filter((m) => m.status === "delivery_unconfirmed"),
      failed: rows.filter((m) => ["failed", "undelivered"].includes(m.status)),
      skipped: rows.filter((m) => m.status === "skipped" || m.error_code === "insufficient_balance"),
      queued: rows.filter((m) => ["queued", "pending", "sending"].includes(m.status)),
    } as Record<string, any[]>;
    return f;
  }, [rows]);

  const items = [
    { key: "all",       label: "All",       count: rows.length },
    { key: "sent",      label: "Accepted",  count: buckets.sent.length },
    { key: "delivered", label: "Delivered", count: buckets.delivered.length },
    { key: "unconfirmed", label: "Unconfirmed", count: buckets.unconfirmed.length },
    { key: "failed",    label: "Failed",    count: buckets.failed.length },
    { key: "skipped",   label: "Skipped",   count: buckets.skipped.length },
    { key: "queued",    label: "Queued",    count: buckets.queued.length },
  ];

  const shown = buckets[filter] ?? rows;

  return (
    <div className="space-y-5">
      {/* Summary band */}
      <Card className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <SummaryStat label="Total" value={stats.attempted} />
          <SummaryStat label="Delivered" value={stats.delivered}
            sub={stats.attempted ? `${((stats.delivered / stats.attempted) * 100).toFixed(1)}%` : "—"} tone="success" />
          <SummaryStat label="Failed" value={stats.failed}
            sub={stats.sent ? `${((stats.failed / stats.sent) * 100).toFixed(1)}%` : "—"} tone="danger" />
          <SummaryStat label="Skipped" value={stats.skipped}
            sub={stats.skipped > 0 ? "no charge" : undefined} tone="muted" />
          <SummaryStat label="Clicked" value={stats.uniqueClickers}
            sub={stats.delivered ? `${((stats.uniqueClickers / stats.delivered) * 100).toFixed(1)}%` : "—"} tone="primary" />
          <SummaryStat label="Opt-outs" value={optOuts} tone="danger" />
          <SummaryStat label="Spend" value={formatUSD(stats.totalCost)} tone="muted" />
          <SummaryStat label="Cost / msg" value={formatUSD(stats.sent ? stats.totalCost / stats.sent : 0)} tone="muted" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-[220px_1fr] gap-5">
        <Card className="p-2 h-fit">
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.key}>
                <button
                  onClick={() => setFilter(i.key)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                    filter === i.key ? "bg-muted font-semibold" : "hover:bg-muted/60"
                  }`}
                >
                  <span>{i.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{i.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-0 overflow-hidden">
          {shown.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No recipients in this bucket yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Segments</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.slice(0, 300).map((m: any) => {
                  const name = [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(" ");
                  const isFailed = ["failed", "undelivered"].includes(m.status);
                  const retryable =
                    isFailed && canRetry && m.error_code !== "cancelled_by_user";
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{name || "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{m.phone_e164}</div>
                      </TableCell>
                      <TableCell>{m.country_code ?? m.profile?.country_code ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                        {m.error_code && <div className="text-[10px] text-destructive mt-0.5">{m.error_code}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">{m.segments_count ?? 1}</TableCell>
                      <TableCell className="tabular-nums">{formatUSD(Number(m.cost ?? 0))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {retryable && onRetry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRetry(m.id)}
                            disabled={retryingId === m.id}
                            title="Re-queue this message for another attempt."
                          >
                            <RotateCw className={`size-3 ${retryingId === m.id ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

        </Card>
      </div>
    </div>
  );
}

function LinkActivity({ uniqueClickers, totalClicks, delivered, clicks }: {
  uniqueClickers: number; totalClicks: number; delivered: number; clicks: any[];
}) {
  const clickRate = delivered ? (uniqueClickers / delivered) * 100 : 0;
  const cpp = uniqueClickers ? totalClicks / uniqueClickers : 0;
  const didnt = Math.max(0, delivered - uniqueClickers);
  const didntPct = delivered ? (didnt / delivered) * 100 : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <LinkStat n={uniqueClickers} label="people clicked" sub={`${clickRate.toFixed(1)}% click rate`} />
          <LinkStat n={totalClicks} label="total clicks" sub={`made by ${uniqueClickers} people`} />
          <LinkStat n={cpp.toFixed(1)} label="clicks per person" sub="among those who clicked" />
          <LinkStat n={didnt} label="didn't click" sub={`${didntPct.toFixed(1)}% of recipients`} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b">
          <div className="font-semibold flex items-center gap-2"><MousePointerClick className="size-4 text-primary" /> Click timeline</div>
          <p className="text-xs text-muted-foreground">Most recent clicks first</p>
        </div>
        {clicks.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No link clicks yet. Add a tracked URL to your message to see activity here.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Message ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clicks.slice(0, 100).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{e.message_id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string; sub?: string; tone: "success" | "danger" | "primary" | "muted";
}) {
  const ring =
    tone === "success" ? "bg-success/10 text-success" :
    tone === "danger" ? "bg-destructive/10 text-destructive" :
    tone === "primary" ? "bg-primary/10 text-primary" :
    "bg-muted text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`size-6 rounded-md grid place-items-center ${ring}`}><Icon className="size-3.5" /></span>
        {label}
      </div>
      <div className="text-2xl font-extrabold mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function UnconfirmedKpi({
  value, sent, onResend, isResending, canResend,
}: {
  value: number; sent: number;
  onResend: (hoursBack: number) => void;
  isResending: boolean; canResend: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const pct = sent > 0 ? (value / sent) * 100 : 0;
  return (
    <Card className="p-4 relative">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-6 rounded-md grid place-items-center bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
          <HelpCircle className="size-3.5" />
        </span>
        Unconfirmed
      </div>
      <div className="text-2xl font-extrabold mt-2 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {sent > 0 ? `${pct.toFixed(0)}% of sent` : "no delivery proof"}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-primary hover:underline mt-1.5"
      >
        What does this mean?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="size-4 text-cyan-500" /> Delivery unconfirmed — explained
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              For every SMS, the carrier does two things:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li><strong className="text-foreground">Accepts the message</strong> — this is "sent".</li>
              <li><strong className="text-foreground">Returns a delivery receipt (DLR)</strong> once the phone received it — this is "delivered".</li>
            </ol>
            <p>
              <strong className="text-foreground">Unconfirmed = step 1 succeeded, step 2 never came back.</strong> The
              carrier accepted your SMS but never told us whether the phone actually rang.
            </p>
            <p>
              Most of these were delivered — the carrier just didn't report it. This is very common for
              international carriers (Africa, Middle East, parts of Asia) that don't return receipts.
            </p>
            <p>
              Use <strong className="text-foreground">Performance by country</strong> below to see which countries this is concentrated in.
              You can also re-send only the unconfirmed messages if recipients report not receiving them —
              note that Telnyx bills per send.
            </p>
            {canResend && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-foreground font-medium">Resend unconfirmed from last</label>
                  <select
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="text-xs bg-background border rounded px-2 py-1"
                  >
                    <option value={6}>6 hours</option>
                    <option value={12}>12 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours</option>
                    <option value={72}>72 hours</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  disabled={isResending}
                  onClick={() => {
                    onResend(hours);
                    setOpen(false);
                  }}
                >
                  {isResending ? "Re-queuing…" : `Re-send unconfirmed (${value.toLocaleString()})`}
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  This costs money — Telnyx charges per send attempt.
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}



function SummaryStat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "success" | "danger" | "primary" | "muted" }) {
  const color =
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-destructive" :
    tone === "primary" ? "text-primary" : "";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LinkStat({ n, label, sub }: { n: number | string; label: string; sub: string }) {
  return (
    <div className="flex gap-3">
      <div className="size-12 rounded-lg bg-primary/10 text-primary grid place-items-center text-lg font-extrabold tabular-nums">{n}</div>
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[260px] grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
      Waiting for the first send to plot engagement…
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

function PhonePreview({ body, mediaUrl }: { body: string; mediaUrl?: string | null }) {
  const isImg = !!mediaUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(mediaUrl);
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[2.5rem] border-[8px] border-foreground/90 bg-foreground/90 shadow-xl">
      <div className="rounded-[2rem] bg-background overflow-hidden">
        {/* Status bar */}
        <div className="relative h-7 bg-background flex items-center justify-between px-5 text-[10px] font-semibold">
          <span>{time}</span>
          <div className="absolute left-1/2 -translate-x-1/2 top-1 w-20 h-4 rounded-full bg-foreground" />
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm border border-foreground/70" />
          </span>
        </div>
        {/* Conversation header */}
        <div className="border-b bg-muted/40 py-2 flex flex-col items-center">
          <div className="size-9 rounded-full bg-gradient-to-br from-primary/70 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            SMS
          </div>
          <div className="text-[11px] font-semibold mt-1">Text Message</div>
        </div>
        {/* Messages */}
        <div className="p-3 min-h-[260px] bg-background space-y-2">
          {isImg && (
            <div className="flex">
              <img
                src={mediaUrl!}
                alt="MMS preview"
                className="rounded-2xl rounded-tl-sm max-w-[85%] max-h-56 object-cover border"
              />
            </div>
          )}
          <div className="flex">
            <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] whitespace-pre-wrap leading-snug max-w-[85%] shadow-sm">
              {body || <span className="text-muted-foreground italic">(empty message)</span>}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground text-center pt-1">Delivered</div>
        </div>
      </div>
    </div>
  );
}

function ProgressPanel({
  data,
  status,
  isFetching,
  failures,
  onRetryReason,
  onRetryAll,
  isRetrying,
}: {
  data?: { total: number; queued: number; sending: number; sent: number; delivered: number; deliveryUnconfirmed?: number; failed: number };
  status?: string;
  isFetching?: boolean;
  failures?: { byReason: Record<string, number>; byCountry: Record<string, number>; total: number };
  onRetryReason?: (code: string) => void;
  onRetryAll?: () => void;
  isRetrying?: boolean;
}) {
  if (!data || data.total === 0) return null;
  const { total, queued, sending, sent, delivered, failed } = data;
  const deliveryUnconfirmed = data.deliveryUnconfirmed ?? 0;
  const inFlight = queued + sending;
  const processed = total - inFlight;
  const processedPct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isPausedForCapacity = status === "paused_low_balance";
  const isDraining = inFlight > 0 && (status === "sending" || status === "queued");
  const topReasons = Object.entries(failures?.byReason ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Dispatcher processes ~600 messages / minute (DELIVER_PER_TICK on a 1-min cron).
  const RATE_PER_MIN = 600;
  const etaMinutes = isDraining ? Math.max(1, Math.ceil(inFlight / RATE_PER_MIN)) : 0;
  const etaLabel =
    etaMinutes === 0
      ? ""
      : etaMinutes < 60
      ? `~${etaMinutes} min remaining`
      : `~${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m remaining`;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Campaign progress
          </div>
          <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
          </span>
          {isDraining && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
              sending · {inFlight.toLocaleString()} left · {etaLabel}
            </span>
          )}
          {status === "queued" && sending === 0 && sent === 0 && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              starting within 1 min…
            </span>
          )}
          {isPausedForCapacity && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              paused · waiting for provider capacity
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {processed.toLocaleString()} / {total.toLocaleString()} processed
        </div>
      </div>

      {/* Segmented progress bar */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
        <Seg pct={(delivered / total) * 100} className="bg-emerald-500" />
        <Seg pct={(sent / total) * 100} className="bg-sky-500" />
        <Seg pct={(deliveryUnconfirmed / total) * 100} className="bg-cyan-500" />
        <Seg pct={(sending / total) * 100} className="bg-amber-500 animate-pulse" />
        <Seg pct={(failed / total) * 100} className="bg-destructive" />
        <Seg pct={(queued / total) * 100} className="bg-muted-foreground/30" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-4">
        <ProgTile label="Queued" value={queued} dotClass="bg-muted-foreground/40" />
        <ProgTile label="Sending" value={sending} dotClass="bg-amber-500" pulse={sending > 0} />
        <ProgTile label="Accepted" value={sent} dotClass="bg-sky-500" />
        <ProgTile label="Delivered" value={delivered} dotClass="bg-emerald-500" />
        <ProgTile label="Unconfirmed" value={deliveryUnconfirmed} dotClass="bg-cyan-500" />
        <ProgTile label="Failed" value={failed} dotClass="bg-destructive" />
      </div>

      {failed > 0 && topReasons.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-destructive" />
              Failure breakdown ({failed.toLocaleString()} failed)
            </div>
            {onRetryAll && status !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetryAll}
                disabled={isRetrying}
                title="Re-queue every failed message on this campaign."
              >
                <RotateCw className={`size-3 mr-1 ${isRetrying ? "animate-spin" : ""}`} />
                Retry all failed
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {topReasons.map(([code, n]) => (
              <li
                key={code}
                className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs">{code}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {friendlyReason(code)}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className="text-destructive border-destructive/30 tabular-nums">
                    {n.toLocaleString()}
                  </Badge>
                  {onRetryReason && status !== "cancelled" && code !== "cancelled_by_user" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRetryReason(code)}
                      disabled={isRetrying}
                    >
                      <RotateCw className="size-3 mr-1" /> Retry
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground mt-3">
        {isDraining
          ? `Processing up to ~600 messages/minute when provider capacity is available. ${processedPct}% complete — you can leave this page and come back later.`
          : isPausedForCapacity
            ? `Paused after checking provider capacity. ${inFlight.toLocaleString()} message${inFlight === 1 ? "" : "s"} remain queued and will resume automatically after top-up.`
            : inFlight === 0 && sent > 0
            ? `${sent.toLocaleString()} message${sent === 1 ? " is" : "s are"} accepted by the carrier and still waiting for a final delivery receipt.`
            : inFlight === 0 && deliveryUnconfirmed > 0
            ? `${deliveryUnconfirmed.toLocaleString()} message${deliveryUnconfirmed === 1 ? " was" : "s were"} finalized by the carrier without delivery confirmation.`
            : inFlight === 0
            ? "All messages have a final carrier status."
            : `${processedPct}% complete.`}
      </div>
    </Card>
  );
}

const REASON_LABELS: Record<string, string> = {
  cancelled_by_user: "Stopped by user before dispatch",
  insufficient_balance: "Account credit ran out before this message was sent",
  exception: "Provider request failed unexpectedly",
  "30007": "Carrier filtered — likely SHAFT/spam content",
  "30003": "Unreachable handset (off / roaming / disconnected)",
  "30004": "Message blocked by carrier",
  "30005": "Unknown destination handset",
  "30006": "Landline or unreachable carrier",
  "30008": "Unknown delivery error",
  "30034": "Blocked — 10DLC not registered (US)",
  "21610": "Recipient replied STOP — number opted out",
  "21614": "Not a valid mobile number",
};
function friendlyReason(code: string): string {
  return REASON_LABELS[code] ?? "See carrier documentation";
}

// Build a CSV report of the campaign's progress metrics + time-bucketed
// delivery counts + failure breakdown, and trigger a browser download.
function exportProgressCsv({
  campaign,
  progress,
  failures,
  messages,
}: {
  campaign: any;
  progress?: { total: number; queued: number; sending: number; sent: number; delivered: number; deliveryUnconfirmed?: number; failed: number };
  failures?: { byReason: Record<string, number>; byCountry: Record<string, number>; total: number };
  messages: any[];
}) {
  const lines: string[] = [];
  const now = new Date();
  lines.push("Campaign progress report");
  lines.push(`Campaign,${csv(campaign?.name ?? "")}`);
  lines.push(`Campaign ID,${csv(campaign?.id ?? "")}`);
  lines.push(`Status,${csv(campaign?.status ?? "")}`);
  lines.push(`Generated at,${csv(now.toISOString())}`);
  lines.push("");
  lines.push("Totals");
  lines.push("metric,count");
  if (progress) {
    lines.push(`total,${progress.total}`);
    lines.push(`queued,${progress.queued}`);
    lines.push(`sending,${progress.sending}`);
    lines.push(`sent,${progress.sent}`);
    lines.push(`delivered,${progress.delivered}`);
    lines.push(`delivery_unconfirmed,${progress.deliveryUnconfirmed ?? 0}`);
    lines.push(`failed,${progress.failed}`);
  }
  lines.push("");
  lines.push("Delivery by hour");
  lines.push("hour_iso,sent,delivered,delivery_unconfirmed,failed");
  const buckets = new Map<number, { sent: number; delivered: number; deliveryUnconfirmed: number; failed: number }>();
  const bucket = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    d.setMinutes(0, 0, 0);
    return d.getTime();
  };
  for (const m of messages) {
    const ts = bucket(m.sent_at);
    if (ts != null) {
      const b = buckets.get(ts) ?? { sent: 0, delivered: 0, deliveryUnconfirmed: 0, failed: 0 };
      b.sent++;
      buckets.set(ts, b);
    }
    const td = bucket(m.delivered_at);
    if (td != null) {
      const b = buckets.get(td) ?? { sent: 0, delivered: 0, deliveryUnconfirmed: 0, failed: 0 };
      b.delivered++;
      buckets.set(td, b);
    }
    if (m.status === "delivery_unconfirmed") {
      const tu = bucket(m.sent_at ?? m.created_at);
      if (tu != null) {
        const b = buckets.get(tu) ?? { sent: 0, delivered: 0, deliveryUnconfirmed: 0, failed: 0 };
        b.deliveryUnconfirmed++;
        buckets.set(tu, b);
      }
    }
    if (["failed", "undelivered"].includes(m.status)) {
      const tf = bucket(m.sent_at ?? m.created_at);
      if (tf != null) {
        const b = buckets.get(tf) ?? { sent: 0, delivered: 0, deliveryUnconfirmed: 0, failed: 0 };
        b.failed++;
        buckets.set(tf, b);
      }
    }
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  for (const [t, v] of sorted) {
    lines.push(`${new Date(t).toISOString()},${v.sent},${v.delivered},${v.deliveryUnconfirmed},${v.failed}`);
  }
  lines.push("");
  lines.push("Failures by reason");
  lines.push("error_code,description,count");
  for (const [code, n] of Object.entries(failures?.byReason ?? {}).sort((a, b) => b[1] - a[1])) {
    lines.push(`${csv(code)},${csv(REASON_LABELS[code] ?? "")},${n}`);
  }
  lines.push("");
  lines.push("Failures by country");
  lines.push("country,count");
  for (const [cc, n] of Object.entries(failures?.byCountry ?? {}).sort((a, b) => b[1] - a[1])) {
    lines.push(`${csv(cc)},${n}`);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (campaign?.name ?? "campaign")
    .toString()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 40);
  a.download = `${safeName}-progress-${now.toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csv(v: string): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}


function Seg({ pct, className }: { pct: number; className: string }) {
  const w = Math.max(0, Math.min(100, pct));
  if (w === 0) return null;
  return <div className={className} style={{ width: `${w}%` }} />;
}

function ProgTile({
  label,
  value,
  dotClass,
  pulse,
}: {
  label: string;
  value: number;
  dotClass: string;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`inline-block size-2 rounded-full ${dotClass} ${pulse ? "animate-pulse" : ""}`} />
        {label}
      </div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

