import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcileCampaignMessages } from "@/lib/reconcile-messages.functions";
import {
  cancelCampaign,
  stopCampaignAsSent,
  pauseCampaign,
  resumeCampaign,
  retryMessage,
  retryFailedMessages,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCampaignRecipientsExport } from "@/lib/tenant-report-export.functions";
import { downloadCsv } from "@/lib/report-export";

import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, AlertTriangle, ShieldOff, Globe,
  Clock, SkipForward, MousePointerClick, Users, Sparkles, TrendingUp, Smartphone,
  DollarSign, Wallet, Activity, XCircle, Download, RotateCw, ExternalLink,
  Pause, Play,
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
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-events", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh delivery statuses"),
  });

  const callExport = useServerFn(getCampaignRecipientsExport);
  const [exportingPhones, setExportingPhones] = useState(false);
  async function exportPhoneNumbers(
    key: "delivered" | "failed" | "not_delivered" | "sent_awaiting" | "clicked" | "replied" | "all",
    label: string,
  ) {
    setExportingPhones(true);
    try {
      const { rows, campaign } = await callExport({ data: { campaignId: id } });
      const filtered = rows.filter((r: any) => {
        switch (key) {
          case "delivered": return r.status === "delivered";
          case "failed": return r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed";
          case "not_delivered": return r.status === "delivery_unconfirmed";
          case "sent_awaiting": return r.status === "sent";
          case "clicked": return (r.click_count ?? 0) > 0;
          case "replied": return (r.reply_count ?? 0) > 0;
          case "all": default: return true;
        }
      });
      if (!filtered.length) { toast.info(`No ${label} to export.`); return; }
      const safe = (campaign?.name ?? "campaign").replace(/[^a-z0-9-_]+/gi, "_");
      downloadCsv(`${safe}_${label}_phone_numbers.csv`, ["phone_number"], filtered.map((r: any) => [r.phone_number]));

      toast.success(`Exported ${filtered.length.toLocaleString()} phone numbers (${label})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExportingPhones(false);
    }
  }


  const campaignQ = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", id).single()).data,
  });

  // ── Polling policy ───────────────────────────────────────────────
  // Only poll while the campaign is still moving AND the tab is visible.
  // Finished campaigns are static, so re-reading them every 15s was burning
  // a huge amount of database IO for no new information.
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const campaignStatus = campaignQ.data?.status as string | undefined;
  const isLive =
    !campaignStatus ||
    ["draft", "scheduled", "queued", "sending", "processing", "paused_low_balance"].includes(campaignStatus);
  const poll = (ms: number) => (isLive && tabVisible ? ms : (false as const));

  // ── Aggregate summary (single indexed server-side pass) ──────────
  const summaryQ = useQuery({
    queryKey: ["campaign-summary", id],
    refetchInterval: poll(20_000),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_report_summary" as any, { _campaign_id: id });
      if (error) throw error;
      return data as any;
    },
  });

  const progress = useMemo(() => {
    const s = summaryQ.data;
    if (!s) return undefined;
    return {
      total: Number(s.total ?? 0),
      queued: Number(s.queued ?? 0),
      sending: Number(s.sending ?? 0),
      sent: Number(s.sent ?? 0),
      delivered: Number(s.delivered ?? 0),
      deliveryUnconfirmed: Number(s.delivery_unconfirmed ?? 0),
      failed: Number(s.failed ?? 0) + Number(s.delivery_unconfirmed ?? 0) + Number(s.sent_with_error ?? 0),
    };
  }, [summaryQ.data]);

  const failures = useMemo(() => {
    const s = summaryQ.data;
    if (!s) return undefined;
    const byReason: Record<string, number> = {};
    for (const r of (s.by_failure_reason ?? []) as any[]) {
      byReason[r.error_code ?? "unknown"] = Number(r.count ?? 0);
    }
    const byCountry: Record<string, number> = {};
    for (const [k, v] of Object.entries((s.failures_by_country ?? {}) as Record<string, any>)) {
      byCountry[k] = Number(v ?? 0);
    }
    return { byReason, byCountry, total: Number(s.failed ?? 0) };
  }, [summaryQ.data]);

  // ── Recipient table: server-side filtering + paging ──────────────
  const RECIPIENTS_PAGE_SIZE = 100;
  const [recipientFilter, setRecipientFilter] = useState<string>("all");
  const [recipientPage, setRecipientPage] = useState(0);
  useEffect(() => { setRecipientPage(0); }, [recipientFilter]);

  const messagesQ = useQuery({
    queryKey: ["campaign-messages", id, recipientFilter, recipientPage],
    refetchInterval: poll(30_000),
    placeholderData: (prev: any) => prev,
    queryFn: async () => {
      const statusFilter: Record<string, string[] | null> = {
        all: null,
        sent: ["sent"],
        delivered: ["delivered"],
        unconfirmed: ["delivery_unconfirmed"],
        failed: ["failed", "undelivered", "delivery_unconfirmed"],
        skipped: ["skipped"],
        queued: ["queued", "pending", "sending"],
      };
      let q = supabase
        .from("messages")
        .select(
          "id, phone_e164, status, error_code, failure_reason, sent_at, delivered_at, created_at, segments_count, country_code, cost, is_mms, force_sms, profile:profile_id(country_code, first_name, last_name)",
          { count: "exact" },
        )
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .range(recipientPage * RECIPIENTS_PAGE_SIZE, recipientPage * RECIPIENTS_PAGE_SIZE + RECIPIENTS_PAGE_SIZE - 1);
      const f = statusFilter[recipientFilter];
      if (f) q = q.in("status", f);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });

  const eventsQ = useQuery({
    queryKey: ["campaign-events", id],
    refetchInterval: poll(60_000),
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, type, created_at, message_id, payload")
        .eq("type", "clicked")
        .order("created_at", { ascending: false })
        .limit(2000);
      return (data ?? []).filter((e: any) => e?.payload?.campaign_id === id);
    },
  });

  // Authoritative click counters live on link_clicks (works for both
  // per-recipient links and a single shared shortlink with no message_id).
  const clicksQ = useQuery({
    queryKey: ["campaign-link-clicks", id],
    refetchInterval: poll(60_000),
    queryFn: async () => {
      const rows: any[] = [];
      for (let from = 0; from < 60_000; from += 1000) {
        const { data, error } = await supabase
          .from("link_clicks")
          .select("clicks, message_id")
          .eq("campaign_id", id)
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const links = rows.length;
      const totalClicks = rows.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
      const clickedLinks = rows.filter((r) => Number(r.clicks ?? 0) > 0).length;
      return { links, totalClicks, clickedLinks };
    },
  });


  // Lightweight two-column pull purely for the engagement chart.
  const seriesQ = useQuery({
    queryKey: ["campaign-series", id],
    refetchInterval: poll(60_000),
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("sent_at, delivered_at")
        .eq("campaign_id", id)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(5000);
      return data ?? [];
    },
  });


  // Realtime: subscribe to message + campaign changes and invalidate the
  // relevant queries. Invalidations are throttled to once every 10s — a large
  // campaign emits thousands of row events and refetching per event was the
  // main source of database load on this page.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.hidden) return;
        queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
        queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      }, 10_000);
    };
    const channel = supabase
      .channel(`campaign-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `campaign_id=eq.${id}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["campaign", id] }),
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
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
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel campaign"),
  });

  const stopSentFn = useServerFn(stopCampaignAsSent);
  const stopSentM = useMutation({
    mutationFn: () => stopSentFn({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Campaign stopped and marked as sent. The report is unchanged.");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to stop campaign"),
  });

  const pauseFn = useServerFn(pauseCampaign);
  const pauseM = useMutation({
    mutationFn: () => pauseFn({ data: { campaignId: id } }),
    onSuccess: (r: any) => {
      toast.success(
        `Campaign paused. ${Number(r?.pausedMessages ?? 0).toLocaleString()} message${
          Number(r?.pausedMessages ?? 0) === 1 ? "" : "s"
        } are on hold until you resume.`,
      );
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to pause campaign"),
  });

  const resumeFn = useServerFn(resumeCampaign);
  const resumeM = useMutation({
    mutationFn: () => resumeFn({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Campaign resumed — sending will continue within a minute.");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to resume campaign"),
  });

  const retryOneFn = useServerFn(retryMessage);
  const retryOneM = useMutation({
    mutationFn: async ({ messageId, forceSms = false }: { messageId: string; forceSms?: boolean }) => {
      const preview: any = await retryOneFn({ data: { messageId, forceSms, dryRun: true } });
      if (Number(preview.shortfall ?? 0) > 0) {
        throw new Error(`Not enough credit: this retry costs ${formatUSD(preview.estimatedCost)} but your balance is ${formatUSD(preview.balance ?? 0)}.`);
      }
      const description = forceSms
        ? "Retry this failed MMS as a text-only SMS without the image? This may improve acceptance, but delivery is not guaranteed."
        : "Send this message again in its original format?";
      if (!window.confirm(`${description}\n\nEstimated charge: ${formatUSD(preview.estimatedCost)}.`)) {
        throw new Error("Retry cancelled");
      }
      return retryOneFn({ data: { messageId, forceSms, confirmed: true } });
    },
    onSuccess: () => {
      toast.success("Message re-queued.");
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const retryAllFn = useServerFn(retryFailedMessages);
  const retryAllM = useMutation({
    mutationFn: async (errorCode?: string | null) => {
      const preview: any = await retryAllFn({ data: { campaignId: id, errorCode: errorCode ?? null, dryRun: true } });
      const count = Number(preview.count ?? 0);
      if (count === 0) return preview;
      const shortfall = Number(preview.shortfall ?? 0);
      if (shortfall > 0) {
        throw new Error(
          `Not enough credit: resending ${count.toLocaleString()} message${count === 1 ? "" : "s"} costs ${formatUSD(preview.estimatedCost)} but your balance is ${formatUSD(preview.balance ?? 0)}. Top up ${formatUSD(shortfall)} first.`,
        );
      }
      const mmsNote = preview.isMms
        ? "\n\nThese are picture messages (MMS). They are paced slower on purpose so the recipient carriers don't reject the batch."
        : "";
      const approved = window.confirm(
        `Send ${count.toLocaleString()} failed message${count === 1 ? "" : "s"} again? Estimated charge: ${formatUSD(preview.estimatedCost)} (balance ${formatUSD(preview.balance ?? 0)}). Each retry is a new paid send attempt.${mmsNote}`,
      );
      if (!approved) throw new Error("Retry cancelled");

      return retryAllFn({ data: { campaignId: id, errorCode: errorCode ?? null, confirmed: true } });
    },
    onSuccess: (r) => {
      toast.success(`Re-queued ${r.retried.toLocaleString()} failed message${r.retried === 1 ? "" : "s"}.`);
      queryClient.invalidateQueries({ queryKey: ["campaign-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-summary", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-failures", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });



  const eligibleQ = useQuery({
    queryKey: ["campaign-eligible", id, campaignQ.data?.audience],
    enabled: !!campaignQ.data,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Count-only RPC — the previous call materialised every matching profile
      // row on the client just to read its length.
      const { data } = await supabase.rpc("my_eligible_profile_count" as any, {
        _audience: campaignQ.data!.audience ?? { include: [], exclude: [] },
      });
      return Number(data ?? 0);
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

  // Exactly what a recipient received: the rendered body of a real sent message
  // (merge fields filled in, links already replaced with their short URLs).
  const sentSampleQ = useQuery({
    queryKey: ["campaign-sent-sample", id],
    enabled: !!campaignQ.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("rendered_body,phone_e164,created_at")
        .eq("campaign_id", id)
        .not("rendered_body", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
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
    const s = summaryQ.data;
    const events = eventsQ.data ?? [];
    const attempted = Math.max(progress?.total ?? 0, eligibleQ.data ?? 0);
    const queued = (progress?.queued ?? 0) + (progress?.sending ?? 0);
    const awaitingDelivery = progress?.sent ?? 0;
    const delivered = progress?.delivered ?? 0;
    const deliveryUnconfirmed = progress?.deliveryUnconfirmed ?? 0;
    const failed = progress?.failed ?? 0;
    const sent = awaitingDelivery + delivered + failed;
    // Eligible recipients without a message row are still being planned; they
    // have not been skipped. Calling this gap "skipped" made an active large
    // campaign look like most of its audience had been discarded.
    const pendingPlanning = Math.max(0, attempted - (progress?.total ?? 0));
    const skipped = 0;
    const linkStats = clicksQ.data ?? { links: 0, totalClicks: 0, clickedLinks: 0 };
    const clicked = linkStats.totalClicks || events.filter((e: any) => e.type === "clicked").length;
    // One shared shortlink → every click is a distinct recipient; per-recipient
    // links → each clicked link is one recipient.
    const uniqueClickers = linkStats.links > 1
      ? linkStats.clickedLinks
      : Math.min(clicked, Math.max(delivered, clicked));

    const totalCost = Number(s?.billed_cost ?? 0);
    const reservedCost = Number(s?.reserved_cost ?? 0);
    const totalSegments = Number(s?.segments ?? 0);
    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const clickRate = delivered > 0 ? Math.min(100, (uniqueClickers / delivered) * 100) : 0;
    const costPerDelivered = delivered > 0 ? totalCost / delivered : 0;

    const byCountry: Record<string, { total: number; delivered: number; unconfirmed: number; failed: number }> = {};
    for (const r of (s?.by_country ?? []) as any[]) {
      byCountry[r.country ?? "—"] = {
        total: Number(r.messages ?? 0),
        delivered: Number(r.delivered ?? 0),
        unconfirmed: 0,
        failed: Number(r.failed ?? 0) + Number(r.delivery_unconfirmed ?? r.unconfirmed ?? 0),
      };
    }

    // Time series — cumulative by hour so the chart never appears to "drop"
    // completed deliveries back to zero after the last webhook hour.
    const points = new Map<number, { t: number; sent: number; delivered: number; clicked: number }>();
    const bucket = (iso: string | null) => {
      if (!iso) return null;
      const d = new Date(iso); d.setMinutes(0, 0, 0); return d.getTime();
    };
    for (const m of (seriesQ.data ?? []) as any[]) {
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
      attempted, queued, sent, awaitingDelivery, delivered, deliveryUnconfirmed, failed, skipped, pendingPlanning, clicked, uniqueClickers,
      totalCost, reservedCost, totalSegments, deliveryRate, clickRate, costPerDelivered,
      byCountry, failures: failures?.byReason ?? {}, series,
    };
  }, [summaryQ.data, progress, failures, seriesQ.data, eventsQ.data, clicksQ.data, eligibleQ.data]);

  if (!campaignQ.data) return <div className="text-muted-foreground">Loading campaign…</div>;
  const c = campaignQ.data;
  const sentAt = (summaryQ.data?.first_created_at as string | undefined) ?? c.updated_at;


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
                  progress,
                  failures,
                  messages: messagesQ.data?.rows ?? [],
                })

              }
              title="Download queued / sending / delivered / failed metrics as CSV."
            >
              <Download className="size-3 mr-1" />
              Export CSV
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exportingPhones}>
                  <Download className="size-3 mr-1" />
                  {exportingPhones ? "Exporting…" : "Export phone numbers"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Phone numbers only</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportPhoneNumbers("delivered", "delivered")}>Delivered</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPhoneNumbers("failed", "failed")}>Failed</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPhoneNumbers("sent_awaiting", "awaiting-carrier")}>Awaiting carrier</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Engagement</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportPhoneNumbers("clicked", "link-clickers")}>Clicked the link</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPhoneNumbers("replied", "responders")}>Replied</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportPhoneNumbers("all", "all")}>All recipients</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {["queued", "sending", "processing", "scheduled"].includes(c.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={pauseM.isPending}
                onClick={() => pauseM.mutate()}
                title="Hold the remaining messages. You can resume any time — nothing already sent is affected."
              >
                <Pause className="size-3 mr-1" />
                {pauseM.isPending ? "Pausing…" : "Pause campaign"}
              </Button>
            )}
            {c.status === "paused_by_user" && (
              <Button
                size="sm"
                disabled={resumeM.isPending}
                onClick={() => resumeM.mutate()}
                title="Continue sending the remaining messages."
              >
                <Play className="size-3 mr-1" />
                {resumeM.isPending ? "Resuming…" : "Resume campaign"}
              </Button>
            )}
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
            {!["sent", "cancelled", "failed"].includes(c.status) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={stopSentM.isPending}
                    title="Stop sending now and finish the campaign as Sent. The report stays exactly as it is."
                  >
                    <CheckCircle2 className="size-3 mr-1" />
                    {stopSentM.isPending ? "Stopping…" : "Stop & mark as sent"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Stop sending and mark as sent?</AlertDialogTitle>
                    <AlertDialogDescription>
                      No further recipients will be queued or sent. The report keeps every
                      current number — delivered, sent, not delivered and failed — along
                      with the cost already incurred, and the campaign will show as Sent.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep sending</AlertDialogCancel>
                    <AlertDialogAction onClick={() => stopSentM.mutate()}>
                      Stop &amp; mark as sent
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
            <div className="text-xs mt-1 opacity-80">
              You haven't been charged for any un-sent messages. If this is a low-balance issue, contact our support team.
            </div>
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
        data={progress}
        status={c.status}
        isFetching={summaryQ.isFetching}
        failures={failures}

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
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide">Text Message</div>
                  <Badge variant={sentSampleQ.data?.rendered_body ? "secondary" : "outline"} className="text-[10px]">
                    {sentSampleQ.data?.rendered_body ? "Exactly as sent" : "Draft template"}
                  </Badge>
                </div>
                <PhonePreview
                  body={sentSampleQ.data?.rendered_body ?? c.message_body}
                  mediaUrl={c.media_url}
                />
                <div className="mt-3 text-[11px] text-muted-foreground">
                  {sentSampleQ.data?.rendered_body
                    ? "This is the real message body delivered to a recipient, including any shortened tracking links."
                    : "No message has been rendered yet — showing the campaign template."}
                </div>
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
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi icon={CheckCircle2} label="Delivery rate" value={`${stats.deliveryRate.toFixed(1)}%`}
                  sub={`${stats.delivered.toLocaleString()} of ${stats.sent.toLocaleString()} handed to carrier`} tone="success" />
                <Kpi icon={Clock} label="Awaiting carrier" value={stats.awaitingDelivery.toLocaleString()}
                  sub="accepted, no final receipt yet" tone="muted" />
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
                  {stats.pendingPlanning > 0 && (
                    <FunnelRow icon={Clock} label="preparing to send" value={stats.pendingPlanning}
                      sub={stats.attempted ? `${pct(stats.pendingPlanning / stats.attempted * 100)} of audience` : undefined} tone="muted" />
                  )}
                  <FunnelRow icon={Send} label="sent to carrier" value={stats.sent}
                    sub={stats.attempted ? `${pct(stats.sent / stats.attempted * 100)} of attempted` : undefined} tone="primary" />
                  {stats.awaitingDelivery > 0 && (
                    <FunnelRow icon={Clock} label="awaiting carrier report" value={stats.awaitingDelivery}
                      sub={stats.sent ? `${pct(stats.awaitingDelivery / stats.sent * 100)} of sent` : undefined} tone="muted" />
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
            rows={messagesQ.data?.rows ?? []}
            totalRows={messagesQ.data?.count ?? 0}
            filter={recipientFilter}
            onFilterChange={setRecipientFilter}
            page={recipientPage}
            pageSize={RECIPIENTS_PAGE_SIZE}
            onPageChange={setRecipientPage}
            isFetching={messagesQ.isFetching}
            stats={stats}
            optOuts={optOutsQ.data ?? 0}
            onRetry={(mid) => retryOneM.mutate({ messageId: mid })}
            onRetryAsSms={(mid) => retryOneM.mutate({ messageId: mid, forceSms: true })}
            retryingId={retryOneM.isPending ? retryOneM.variables?.messageId : undefined}
            canRetry={c.status !== "cancelled"}
          />


        </TabsContent>

        {/* ───────────── LINKS ───────────── */}
        <TabsContent value="links" className="mt-5">
          <LinkActivity
            campaignId={id}
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
                <Stat label="Charged so far" value={formatUSD(stats.totalCost)} />
                {stats.reservedCost > 0 && (
                  <Stat label="Not yet sent (estimate)" value={formatUSD(stats.reservedCost)} />
                )}
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
                    const failRate = v.total ? (v.failed / v.total) * 100 : 0;
                    return (
                      <li key={cc} className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">{cc} · {v.total.toLocaleString()}</span>
                          <span className="text-muted-foreground tabular-nums">{rate.toFixed(0)}% delivered</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                          <div className="h-full bg-success" style={{ width: `${rate}%` }} />
                          <div className="h-full bg-destructive" style={{ width: `${failRate}%` }} />
                        </div>
                        {v.failed > 0 && <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{v.failed.toLocaleString()} failed</div>}
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
                  Messages skipped for insufficient balance are <strong>never charged</strong> — top up to retry, or contact support.
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
  totalRows,
  filter,
  onFilterChange,
  page,
  pageSize,
  onPageChange,
  isFetching,
  stats,
  optOuts,
  onRetry,
  onRetryAsSms,
  retryingId,
  canRetry,
}: {
  rows: any[];
  totalRows: number;
  filter: string;
  onFilterChange: (f: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  isFetching?: boolean;
  stats: any;
  optOuts: number;
  onRetry?: (messageId: string) => void;
  onRetryAsSms?: (messageId: string) => void;
  retryingId?: string;
  canRetry?: boolean;
}) {
  // Counts come from the aggregate summary, not from the current page.
  const items = [
    { key: "all",       label: "All",       count: stats.attempted },
    { key: "sent",      label: "Accepted",  count: stats.awaitingDelivery },
    { key: "delivered", label: "Delivered", count: stats.delivered },
    { key: "failed",    label: "Failed",    count: stats.failed },
    ...(stats.pendingPlanning > 0
      ? [{ key: "skipped", label: "Preparing", count: stats.pendingPlanning }]
      : []),
    { key: "queued",    label: "Queued",    count: stats.queued },
  ];

  const shown = rows;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));


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
          <SummaryStat label="Preparing" value={stats.pendingPlanning}
            sub={stats.pendingPlanning > 0 ? "will be queued next" : undefined} tone="muted" />
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
                  onClick={() => onFilterChange(i.key)}
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
                {shown.map((m: any) => {
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
                      <TableCell className="max-w-[260px]">
                        <StatusBadge status={m.status} />
                        {m.error_code && <div className="text-[10px] text-destructive mt-0.5 font-mono">{m.error_code}</div>}
                        {m.error_code === "40008" && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            Recipient carrier rejected this message. It reached the carrier, but was not accepted for delivery.
                          </div>
                        )}
                        {m.failure_reason && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug" title={m.status === "delivery_unconfirmed" ? "Delivery could not be confirmed by the recipient carrier." : m.failure_reason}>
                            {m.status === "delivery_unconfirmed" ? "Delivery could not be confirmed by the recipient carrier." : (m.failure_reason.length > 120 ? m.failure_reason.slice(0, 120) + "…" : m.failure_reason)}
                          </div>
                        )}
                        {!m.failure_reason && m.status === "delivery_unconfirmed" && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            Delivery could not be confirmed by the recipient carrier.
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="tabular-nums">{m.segments_count ?? 1}</TableCell>
                      <TableCell className="tabular-nums">{formatUSD(Number(m.cost ?? 0))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {retryable && (
                          <div className="flex justify-end gap-1">
                            {m.is_mms && onRetryAsSms && (
                              <Button variant="outline" size="sm" onClick={() => onRetryAsSms(m.id)} disabled={retryingId === m.id}>
                                <Send className="size-3 mr-1" /> Retry as SMS
                              </Button>
                            )}
                            {onRetry && (
                              <Button variant="ghost" size="sm" onClick={() => onRetry(m.id)} disabled={retryingId === m.id} title="Retry in the original format.">
                                <RotateCw className={`size-3 ${retryingId === m.id ? "animate-spin" : ""}`} />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
            <div>
              {totalRows === 0
                ? "No recipients"
                : `Showing ${(page * pageSize + 1).toLocaleString()}–${Math.min((page + 1) * pageSize, totalRows).toLocaleString()} of ${totalRows.toLocaleString()}`}
              {isFetching ? " · updating…" : ""}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>
                Previous
              </Button>
              <span className="tabular-nums">Page {page + 1} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

function LinkActivity({ campaignId, uniqueClickers, totalClicks, delivered, clicks }: {
  campaignId: string; uniqueClickers: number; totalClicks: number; delivered: number; clicks: any[];
}) {
  const clickRate = delivered ? (uniqueClickers / delivered) * 100 : 0;
  const cpp = uniqueClickers ? totalClicks / uniqueClickers : 0;
  const didnt = Math.max(0, delivered - uniqueClickers);
  const didntPct = delivered ? (didnt / delivered) * 100 : 0;

  const linksQ = useQuery({
    queryKey: ["campaign-links", campaignId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("link_clicks")
        .select("short_code, url, clicks, first_click_at, last_click_at, message_id")
        .eq("campaign_id", campaignId)
        .limit(5000);
      return data ?? [];
    },
  });

  const perUrl = useMemo(() => {
    const map = new Map<string, { url: string; total: number; unique: number; sent: number; messagesClicked: Set<string>; codes: Set<string> }>();
    for (const r of linksQ.data ?? []) {
      const cur = map.get(r.url) ?? { url: r.url, total: 0, unique: 0, sent: 0, messagesClicked: new Set<string>(), codes: new Set<string>() };
      cur.sent += 1;
      cur.total += Number(r.clicks ?? 0);
      if (r.short_code) cur.codes.add(r.short_code as string);
      if ((r.clicks ?? 0) > 0) cur.messagesClicked.add(r.message_id as string);
      map.set(r.url, cur);
    }
    return [...map.values()]
      .map((r) => ({ ...r, unique: r.messagesClicked.size }))
      .sort((a, b) => b.total - a.total);
  }, [linksQ.data]);


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
          <div className="font-semibold flex items-center gap-2"><MousePointerClick className="size-4 text-primary" /> Links in this campaign</div>
          <p className="text-xs text-muted-foreground">
            Every URL in your message is automatically shortened and tracked. Click-through rate = recipients who clicked ÷ recipients the link was sent to.
          </p>
        </div>
        {perUrl.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No tracked links in this campaign. Include any http(s):// URL in your message body and it will be tracked automatically.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destination URL</TableHead>
                <TableHead>Short link sent</TableHead>
                <TableHead className="text-right">Sent to</TableHead>
                <TableHead className="text-right">People clicked</TableHead>
                <TableHead className="text-right">Total clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perUrl.map((r) => {
                const codes = [...r.codes];
                return (
                <TableRow key={r.url}>
                  <TableCell className="max-w-[360px]">
                    <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline break-all text-sm">{r.url}</a>
                  </TableCell>
                  <TableCell className="max-w-[220px] text-sm">
                    {codes.length === 0 ? (
                      <span className="text-muted-foreground">Sent unshortened</span>
                    ) : codes.length === 1 ? (
                      <span className="font-mono text-xs break-all">xellvio.com/r/{codes[0]}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {codes.length.toLocaleString()} unique short links (one per recipient)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.sent.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unique.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sent ? ((r.unique / r.sent) * 100).toFixed(1) + "%" : "—"}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>

          </Table>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b">
          <div className="font-semibold flex items-center gap-2"><MousePointerClick className="size-4 text-primary" /> Click timeline</div>
          <p className="text-xs text-muted-foreground">Most recent clicks first</p>
        </div>
        {clicks.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No link clicks yet.
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
        <Seg pct={(sending / total) * 100} className="bg-amber-500 animate-pulse" />
        <Seg pct={(failed / total) * 100} className="bg-destructive" />
        <Seg pct={(queued / total) * 100} className="bg-muted-foreground/30" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        <ProgTile label="Queued" value={queued} dotClass="bg-muted-foreground/40" />
        <ProgTile label="Sending" value={sending} dotClass="bg-amber-500" pulse={sending > 0} />
        <ProgTile label="Accepted" value={sent} dotClass="bg-sky-500" />
        <ProgTile label="Delivered" value={delivered} dotClass="bg-emerald-500" />
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
            : inFlight === 0
            ? "All messages have a final carrier status."
            : `${processedPct}% complete.`}
      </div>
    </Card>
  );
}

const REASON_LABELS: Record<string, string> = {
  cancelled_by_user: "Stopped by user before dispatch",
  insufficient_balance: `Account credit ran out before this message was sent. Add funds or contact support`,
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
  "40008": "Recipient carrier rejected this message. It reached the carrier, but was not accepted for delivery.",
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

