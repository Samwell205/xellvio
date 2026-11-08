import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Download, FileDown } from "lucide-react";
import { adminGetCampaignReport, adminCheckAndResumeCampaign } from "@/lib/admin-campaigns.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const RESUMABLE = ["paused", "paused_by_user"];

function CampaignPauseStatus({ campaign, account, onDone }: {
  campaign: { id: string; status: string; paused_reason?: string | null; paused_at?: string | null };
  account: { id: string | null; onboarding_status?: string | null; sending_suspended_at?: string | null; sending_suspended_reason?: string | null };
  onDone: () => void;
}) {
  const resume = useServerFn(adminCheckAndResumeCampaign);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const resumable = RESUMABLE.includes(campaign.status) && !!account.id;
  const showPanel = resumable || !!campaign.paused_reason || !!account.sending_suspended_at;
  if (!showPanel && !result) return null;

  async function run() {
    if (!account.id) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await resume({ data: { campaignId: campaign.id, accountId: account.id } });
      setResult({ ok: r.ok, message: r.message });
      if (r.ok) toast.success(r.message);
      onDone();
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? "Could not check this campaign." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Current pause: </span>
          <span className="font-medium">{campaign.paused_reason ?? (RESUMABLE.includes(campaign.status) ? "Paused (no reason recorded)" : "—")}</span>
          {campaign.paused_at && <span className="text-muted-foreground"> · {new Date(campaign.paused_at).toLocaleString()}</span>}
        </div>
        <div>
          <span className="text-muted-foreground">Account: </span>
          <span className="font-medium">{account.onboarding_status ?? "unknown"}</span>
          <span className="text-muted-foreground"> · Sending hold: </span>
          <span className="font-medium">
            {account.sending_suspended_at
              ? `On since ${new Date(account.sending_suspended_at).toLocaleString()}${account.sending_suspended_reason ? ` — ${account.sending_suspended_reason}` : ""}`
              : "None"}
          </span>
        </div>
      </div>
      {resumable && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={busy}>
              {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
              Check and resume
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Check and resume this campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                This runs a fresh content check on the campaign's current message. Only if the check allows it,
                the remaining messages are queued and sent through the normal sender with normal charges and opt-outs.
                If the check blocks or flags it, or the account is on hold, the campaign stays paused.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={run}>Check and resume</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-primary" : "text-destructive"}`}>
          {result.ok ? "Resumed: " : "Stayed paused: "}{result.message}
        </p>
      )}
    </Card>
  );
}
import { formatUSD } from "@/lib/money";
import { downloadCsv, downloadPdf } from "@/lib/report-export";
import { adminRecoverCampaignReceipts, adminRecoverCampaignPrices } from "@/lib/reconcile-messages.functions";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign operations — Xellvio Admin" }, { name: "description", content: "Campaign delivery receipts and financial review." }, { property: "og:title", content: "Campaign operations — Xellvio Admin" }, { property: "og:description", content: "Review delivery outcomes and recover receipts without resending." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AdminCampaignReportPage,
});

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "bad";
  hint?: string;
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600"
          : "";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

function AdminCampaignReportPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(adminGetCampaignReport);
  const recover = useServerFn(adminRecoverCampaignReceipts);
  const recoverPrices = useServerFn(adminRecoverCampaignPrices);
  const [pricing, setPricing] = useState(false);
  const [pricesRecovered, setPricesRecovered] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState(0);
  const q = useQuery({
    queryKey: ["admin", "campaign-report", id],
    queryFn: () => fn({ data: { campaignId: id } }),
    // Stop polling once the campaign is finished or the tab is hidden.
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.campaign?.status as string | undefined;
      const live =
        !status ||
        ["draft", "scheduled", "queued", "sending", "processing", "paused_low_balance"].includes(
          status,
        );
      return live && typeof document !== "undefined" && !document.hidden ? 30_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  if (q.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="p-6 text-destructive">
        Failed to load report: {(q.error as any)?.message ?? "unknown"}
      </div>
    );
  }

  const r = q.data;
  const c = r.campaign;
  if (!c) return <div>Campaign not found.</div>;
  const t = r.totals;

  async function recoverReceipts() {
    setRecovering(true);
    setRecoveryProgress(0);
    let after: string | undefined;
    let checked = 0, updated = 0, errors = 0;
    try {
      for (let page = 0; page < 1000; page++) {
        const result = await recover({ data: { campaignId: id, after } });
        checked += result.checked; updated += result.updated; errors += result.errors;
        setRecoveryProgress(checked);
        if (result.done || !result.nextCursor || result.nextCursor === after) break;
        after = result.nextCursor;
      }
      toast.success(`Checked ${checked.toLocaleString()} receipts; updated ${updated.toLocaleString()} results. No messages resent.`);
      if (errors) toast.warning(`${errors.toLocaleString()} lookups remain unavailable. Run recovery again later.`);
    } catch { toast.error('Receipt recovery stopped. Saved results are retained; you can retry.'); }
    finally { setRecovering(false); await q.refetch(); }
  }

  async function recoverPriceRecords() {
    setPricing(true);
    setPricesRecovered(0);
    let after: string | undefined, pageToken: string | undefined;
    let priced = 0;
    try {
      for (let page = 0; page < 1000; page++) {
        const result = await recoverPrices({ data: { campaignId: id, after, pageToken } });
        priced += result.priced;
        setPricesRecovered(priced);
        if (result.done) break;
        after = result.after ?? undefined;
        pageToken = result.pageToken ?? undefined;
      }
      toast.success(`Recovered ${priced.toLocaleString()} message prices. No texts resent or charges changed.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Price recovery stopped; saved prices are retained."); }
    finally { setPricing(false); await q.refetch(); }
  }

  function exportCsv() {
    downloadCsv(
      `admin-${c.name.replace(/[^a-z0-9]+/gi, "_")}-breakdown.csv`,
      [
        "country",
        "recipients",
        "segments",
        "delivered",
        "failed",
        "tenant_spend_usd",
        "estimated_carrier_cost_usd",
        "estimated_margin_usd",
      ],
      r.byCountry.map((row) => [
        row.country_code,
        row.recipients,
        row.segments,
        row.delivered,
        row.failed,
        row.cost,
        row.carrier_cost,
        row.margin,
      ]),
    );
  }
  function exportPdf() {
    downloadPdf({
      filename: `admin-${c.name.replace(/[^a-z0-9]+/gi, "_")}-report.pdf`,
      title: c.name,
      subtitle: `Tenant: ${r.account.label} • ${new Date(c.created_at).toLocaleString()}`,
      sections: [
        {
          type: "kv",
          title: "Financial breakdown",
          items: [
            ["Recipients", t.total.toLocaleString()],
            ["Segments", t.segments.toLocaleString()],
            ["Delivered", `${t.delivered.toLocaleString()} (${t.delivery_rate}%)`],
            ["Failed", t.failed.toLocaleString()],
            ["Charged to tenant", formatUSD(t.cost)],
            ["Not yet sent (estimate)", formatUSD(Number(t.reserved_cost ?? 0))],
            ["Carrier cost (estimate)", formatUSD(t.carrier_cost)],
            ["Margin (estimate)", formatUSD(t.margin)],
            ["Recorded send attempts", Number(r.attemptAudit?.total ?? 0).toLocaleString()],
            ["Approved retries", Number(r.attemptAudit?.retries ?? 0).toLocaleString()],
            ["Retry charges", formatUSD(Number(r.attemptAudit?.retry_charged ?? 0))],
          ],
        },
        {
          type: "table",
          title: "By country",
          head: [
            "Country",
            "Recipients",
            "Segments",
            "Delivered",
            "Failed",
            "Tenant $",
            "Est. carrier $",
            "Est. margin",
          ],
          rows: r.byCountry.map((row) => [
            row.country_code,
            row.recipients,
            row.segments,
            row.delivered,
            row.failed,
            formatUSD(row.cost),
            formatUSD(row.carrier_cost),
            formatUSD(row.margin),
          ]),
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/campaigns"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="size-3" /> All campaigns
          </Link>
          <h1 className="text-2xl font-extrabold mt-2 flex items-center gap-2">
            {t.is_mms && (
              <Badge className="bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100 border-fuchsia-200 text-xs">
                MMS · {t.mms_count?.toLocaleString?.() ?? ""}
              </Badge>
            )}
            {c.name}
          </h1>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center mt-1">
            <span>
              Tenant: <span className="font-medium text-foreground">{r.account.label}</span>
            </span>
            <span>•</span>
            <span>{r.account.email}</span>
            <span>•</span>
            <Badge variant="outline">{c.status}</Badge>
            <span>•</span>
            <span>{new Date(c.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" disabled={pricing} onClick={recoverPriceRecords}>
            <Loader2 className={`size-4 mr-1 ${pricing ? 'animate-spin' : ''}`} />
            {pricing ? `Recovered ${pricesRecovered.toLocaleString()}…` : 'Recover prices'}
          </Button>
          <Button variant="outline" size="sm" disabled={recovering} onClick={recoverReceipts}>
            <Loader2 className={`size-4 mr-1 ${recovering ? 'animate-spin' : ''}`} />
            {recovering ? `Checking ${recoveryProgress.toLocaleString()}…` : 'Recover receipts'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <FileDown className="size-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <Download className="size-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      <CampaignPauseStatus
        campaign={c}
        account={r.account}
        onDone={() => q.refetch()}
      />


      <Card className="p-4">
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <div className="text-xs uppercase text-muted-foreground mb-1">Message body</div>
            <div className="text-sm whitespace-pre-wrap">{c.message_body}</div>
          </div>
          {(c as any).media_url && (
            <a href={(c as any).media_url} target="_blank" rel="noreferrer" className="shrink-0">
              <img
                src={(c as any).media_url}
                alt="Attached MMS image"
                className="w-28 h-28 object-cover rounded-md border"
              />
              <div className="text-[11px] text-muted-foreground mt-1 text-center">
                Attached image
              </div>
            </a>
          )}
        </div>
      </Card>

      {(t.not_sent_insufficient > 0 || t.carrier_rejected > 0) && (
        <Card className="p-4 space-y-1 border-amber-200 bg-amber-50">
          {t.not_sent_insufficient > 0 && (
            <div className="text-sm text-amber-900">
              {t.not_sent_insufficient.toLocaleString()} recipients were never sent — the tenant
              wallet ran out mid-campaign. They were not charged.
            </div>
          )}
          {t.carrier_rejected > 0 && (
            <div className="text-sm text-amber-900">
              {t.carrier_rejected.toLocaleString()} reached the recipient carrier but were rejected
              before delivery (code 40008). The carrier did not provide a more specific reason.
              {t.is_mms
                ? " Retrying without the image may improve acceptance, but does not guarantee delivery."
                : ""}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Recipients" value={t.total.toLocaleString()} />
        <Stat
          label={t.is_mms ? "MMS messages" : "Segments"}
          value={(t.is_mms ? t.mms_count : t.segments).toLocaleString()}
        />
        <Stat label="Delivered" value={t.delivered.toLocaleString()} tone="ok" />
        <Stat label="Failed" value={t.failed.toLocaleString()} tone="bad" />
        <Stat label="Unconfirmed" value={t.delivery_unconfirmed.toLocaleString()} hint="Not a confirmed failure" />
        <Stat label="Awaiting" value={(t.awaiting_delivery + t.queued).toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Delivery rate"
          value={`${t.delivery_rate}%`}
          tone={t.delivery_rate >= 80 ? "ok" : t.delivery_rate >= 50 ? "warn" : "bad"}
        />
        <Stat
          label="Charged to tenant"
          value={formatUSD(t.cost)}
          hint={
            Number(t.reserved_cost ?? 0) > 0
              ? `${formatUSD(Number(t.reserved_cost))} not yet sent`
              : undefined
          }
        />
        <Stat
          label="Carrier cost (estimate)"
          value={formatUSD(t.carrier_cost)}
          hint="Rate-based estimate across all sending routes"
        />
        <Stat
          label="Margin (estimate)"
          value={formatUSD(t.margin)}
          tone={t.margin >= 0 ? "ok" : "bad"}
          hint="Tenant charge minus estimated carrier cost"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={t.price_pending_count > 0 ? "Partial recorded message prices" : "Recorded message prices"}
          value={formatUSD(t.actual_carrier_cost)}
          hint={`${t.priced_count.toLocaleString()} priced · ${t.price_pending_count.toLocaleString()} missing. Carrier surcharges excluded.`}
        />
        <Stat
          label="Confirmed campaign profit"
          value="Unavailable"
          hint="Message prices do not include reconciled carrier surcharges. Estimates are not confirmed profit."
        />
      </div>

      {t.charged_without_submission_count > 0 && (
        <div role="status" className="border-l-4 border-destructive pl-4 py-2 text-sm">
          <strong>{formatUSD(t.charged_without_submission)} charged across {t.charged_without_submission_count.toLocaleString()} recipients without a recorded submission.</strong>
          <p className="text-muted-foreground">Included in tenant charges; requires accounting review. No refund or resend has been applied.</p>
        </div>
      )}

      {(r as any).clicks?.links > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Links tracked" value={(r as any).clicks.links.toLocaleString()} />
          <Stat
            label="Total clicks"
            value={(r as any).clicks.total_clicks.toLocaleString()}
            tone="ok"
          />
          <Stat label="Click rate" value={`${(r as any).clicks.click_rate}%`} />
        </div>
      )}

      <Card className="p-4">
        <div className="font-semibold text-sm mb-3">Send attempt audit</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Recorded attempts</div>
            <div className="text-lg font-semibold">
              {Number(r.attemptAudit?.total ?? 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Approved retries</div>
            <div className="text-lg font-semibold">
              {Number(r.attemptAudit?.retries ?? 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Retry charges</div>
            <div className="text-lg font-semibold">
              {formatUSD(Number(r.attemptAudit?.retry_charged ?? 0))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Retry margin (estimate)</div>
            <div className="text-lg font-semibold">
              {formatUSD(
                Number(r.attemptAudit?.retry_charged ?? 0) -
                  Number(r.attemptAudit?.retry_carrier_cost ?? 0),
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-3 border-b bg-muted/40 font-semibold text-sm">By country</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left">
              <tr>
                <th className="p-3">Country</th>
                <th className="p-3 text-right">Recipients</th>
                <th className="p-3 text-right">Segments</th>
                <th className="p-3 text-right">Delivered</th>
                <th className="p-3 text-right">Failed</th>
                <th className="p-3 text-right">Tenant spend</th>
                <th className="p-3 text-right">Est. carrier cost</th>
                <th className="p-3 text-right">Est. margin</th>
              </tr>
            </thead>
            <tbody>
              {r.byCountry.map((row) => (
                <tr key={row.country_code} className="border-t">
                  <td className="p-3 font-mono">{row.country_code}</td>
                  <td className="p-3 text-right tabular-nums">{row.recipients.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{row.segments.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-600">
                    {row.delivered.toLocaleString()}
                  </td>
                  <td className="p-3 text-right tabular-nums text-destructive">
                    {row.failed.toLocaleString()}
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.cost)}</td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.carrier_cost)}</td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.margin)}</td>
                </tr>
              ))}
              {r.byCountry.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {r.bySenderKind.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/40 font-semibold text-sm">By sender type</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left">
                <tr>
                  <th className="p-3">Sender</th>
                  <th className="p-3 text-right">Used</th>
                  <th className="p-3 text-right">Delivered</th>
                  <th className="p-3 text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {r.bySenderKind.map((s) => (
                  <tr key={s.sender_kind} className="border-t">
                    <td className="p-3">{s.sender_kind}</td>
                    <td className="p-3 text-right tabular-nums">{s.used.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">
                      {s.delivered.toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums text-destructive">
                      {s.failed.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {r.failures.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/40 font-semibold text-sm">
            Failures ({r.failures.length})
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left sticky top-0">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {r.failures.map((f, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(f.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 tabular-nums">{f.phone_e164}</td>
                    <td className="p-3">{f.country_code ?? "—"}</td>
                    <td className="p-3 text-xs">{f.error_code ?? "—"}</td>
                    <td className="p-3 text-xs">{f.failure_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">Account balance changes can also include other campaigns, inbound messages and number fees. They are not this campaign's confirmed cost.</div>
    </div>
  );
}
