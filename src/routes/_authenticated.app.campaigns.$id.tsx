import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, AlertTriangle, ShieldOff, Globe,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign report — Samwell Global SMS" }] }),
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
        .select("id, phone_e164, status, error_code, sent_at, delivered_at, segments_count, profile:profile_id(country_code, first_name, last_name)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(1000);
      return data ?? [];
    },
  });

  const optOutsQ = useQuery({
    queryKey: ["campaign-optouts", id, campaignQ.data?.created_at],
    enabled: !!campaignQ.data,
    queryFn: async () => {
      const since = campaignQ.data!.created_at;
      const { count } = await supabase
        .from("suppressions").select("*", { count: "exact", head: true })
        .eq("reason", "inbound_stop")
        .gte("created_at", since);
      return count ?? 0;
    },
  });

  const stats = useMemo(() => {
    const rows = messagesQ.data ?? [];
    const total = rows.length;
    const sent = rows.filter((m: any) => ["sent", "delivered", "undelivered", "failed"].includes(m.status)).length;
    const delivered = rows.filter((m: any) => m.status === "delivered").length;
    const failed = rows.filter((m: any) => m.status === "failed" || m.status === "undelivered").length;
    const queued = rows.filter((m: any) => m.status === "queued").length;
    const rate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

    const byCountry: Record<string, { total: number; delivered: number; failed: number }> = {};
    const failures: Record<string, number> = {};
    for (const m of rows as any[]) {
      const c = m.profile?.country_code ?? "—";
      byCountry[c] ??= { total: 0, delivered: 0, failed: 0 };
      byCountry[c].total++;
      if (m.status === "delivered") byCountry[c].delivered++;
      if (m.status === "failed" || m.status === "undelivered") byCountry[c].failed++;
      if ((m.status === "failed" || m.status === "undelivered") && m.error_code) {
        failures[m.error_code] = (failures[m.error_code] ?? 0) + 1;
      }
    }
    return { total, sent, delivered, failed, queued, rate, byCountry, failures };
  }, [messagesQ.data]);

  if (!campaignQ.data) return <div className="text-muted-foreground">Loading campaign…</div>;
  const c = campaignQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app/campaigns" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3" /> Back to campaigns
          </Link>
          <h1 className="text-2xl font-extrabold mt-1">{c.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={c.status} />
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <RefreshCw className={`size-3 ${messagesQ.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat icon={Send} label="Total recipients" value={stats.total} />
        <Stat icon={Send} label="Sent" value={stats.sent} />
        <Stat icon={CheckCircle2} label="Delivered" value={stats.delivered} tone="success" />
        <Stat icon={AlertTriangle} label="Failed" value={stats.failed} tone="danger" />
        <Stat icon={ShieldOff} label="Opt-outs (since send)" value={optOutsQ.data ?? 0} tone="danger" />
      </div>

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
                <TableHead>Delivered</TableHead><TableHead>Failed</TableHead><TableHead>Rate</TableHead>
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
                      <TableCell>{v.total ? Math.round((v.delivered / v.total) * 100) : 0}%</TableCell>
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

      <Card className="p-4">
        <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3">Recent messages</div>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Phone</TableHead><TableHead>Country</TableHead>
              <TableHead>Status</TableHead><TableHead>Error</TableHead><TableHead>Sent</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(messagesQ.data ?? []).slice(0, 50).map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.phone_e164}</TableCell>
                  <TableCell>{m.profile?.country_code ?? "—"}</TableCell>
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

      <Card className="p-4">
        <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Message body</div>
        <pre className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">{c.message_body}</pre>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone?: "success" | "danger" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : tone === "danger" ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
