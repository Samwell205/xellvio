import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminFinanceOverview, adminFinanceTenants, adminMarginAudit, adminPricingPreview } from "@/lib/admin-finance.functions";
import { adminListRecoveryCases, adminRecoveryCaseCsv, adminSendRecoveryNotice, adminUpdateRecoveryCase } from "@/lib/reconciliation-recovery.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  component: FinancePage,
  head: () => ({
    meta: [
      { title: "Finance analysis · Xellvio Admin" },
      { name: "description", content: "Money in, credits used, carrier cost and profit across every Xellvio tenant." },
      { property: "og:title", content: "Finance analysis · Xellvio Admin" },
      { property: "og:description", content: "Money in, credits used, carrier cost and profit across every Xellvio tenant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const usd = (n: any) =>
  Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = (n: any) => Number(n ?? 0).toLocaleString("en-US");
const date = (d: any) => (d ? new Date(d).toLocaleString() : "—");

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`text-2xl font-semibold mt-1 ${
            tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : ""
          }`}
        >
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1 leading-snug">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function FinancePage() {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(adminFinanceOverview);
  const tenantsFn = useServerFn(adminFinanceTenants);

  const { data, isLoading, error } = useQuery({ queryKey: ["admin-finance"], queryFn: () => overviewFn({}) });
  const { data: tenants } = useQuery({ queryKey: ["admin-finance-tenants"], queryFn: () => tenantsFn({}) });

  const marginFn = useServerFn(adminMarginAudit);
  const pricingFn = useServerFn(adminPricingPreview);
  const { data: margins } = useQuery({ queryKey: ["admin-margin-audit"], queryFn: () => marginFn({}) });
  const { data: pricing } = useQuery({
    queryKey: ["admin-pricing-preview"],
    queryFn: () => pricingFn({ data: { markupPercent: 100 } }),
  });
  const recoveryFn = useServerFn(adminListRecoveryCases);
  const updateRecoveryFn = useServerFn(adminUpdateRecoveryCase);
  const csvRecoveryFn = useServerFn(adminRecoveryCaseCsv);
  const noticeRecoveryFn = useServerFn(adminSendRecoveryNotice);
  const { data: recoveries } = useQuery({ queryKey: ["admin-recovery-cases"], queryFn: () => recoveryFn({}) });
  const updateRecovery = useMutation({
    mutationFn: (input: { id: string; status: string }) => updateRecoveryFn({ data: input }),
    onSuccess: () => { toast.success("Recovery case updated"); queryClient.invalidateQueries({ queryKey: ["admin-recovery-cases"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadRecovery = async (id: string, title: string) => {
    const csv = await csvRecoveryFn({ data: { id } });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading finance analysis…</div>;
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>;

  const s: any = data?.summary ?? {};
  const mi = s.money_in ?? {};
  const led = s.ledger ?? {};
  const w = s.wallets ?? {};
  const u = s.usage ?? {};
  const inb = s.inbound ?? {};
  const attempts: any = data?.attemptAudit ?? {};

  // Use led.debits (the actual ledger total — same figure shown on the
  // "Credits tenants spent" card) rather than u.tenant_spend, which silently
  // excludes messages that were charged at reservation time but ended up
  // status='failed'. Also account for inbound carrier cost, which the RPC
  // computes but this page previously never subtracted anywhere.
  const totalCarrierCost = Number(u.carrier_cost ?? 0) + Number(inb.carrier_cost ?? 0);
  const grossProfit = Number(led.debits ?? 0) - totalCarrierCost;
  const cashHeld = Number(mi.confirmed_credits ?? 0) - Number(led.refunds ?? 0) - totalCarrierCost;

  // "Unused tenant credit" is the live sum of every tenant wallet balance — the
  // exact same figure as the sum of the Balance column in the per-tenant table
  // below, so the headline and the detail can never disagree. The portion of it
  // actually backed by cash (vs goodwill/adjustment grants with no payment row)
  // is reported separately instead of silently replacing the total.
  const rec = s.reconciliation ?? {};
  const walletTotal = Number(w.unused_credits ?? 0);
  const grantedCredit = Number(rec.granted_credit ?? 0);
  const cashBackedCredit = Number(mi.confirmed_credits ?? 0) - Number(led.debits ?? 0) + Number(led.refunds ?? 0);
  const ledgerDrift = Number(rec.drift ?? 0);


  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold">Finance analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every figure below is calculated live from payments, tenant wallets and the messages actually sent. Amounts are
          in USD.
        </p>
      </div>

      {/* 1. Where the money is */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">1 · Where your money is</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Carrier account balance"
            value={data?.providerBalance?.ok ? usd(data.providerBalance.balance) : "Unavailable"}
            hint={
              data?.providerBalance?.ok
                ? `Live now · last recorded ${date(data?.lastSnapshot?.checked_at)}`
                : data?.providerBalance?.error ?? "Could not reach the carrier API"
            }
          />
          <Stat
            label="Money received (confirmed)"
            value={usd(mi.confirmed_credits)}
            hint={`${num(mi.confirmed_count)} confirmed payments · ${usd(mi.last_30d)} in the last 30 days`}
          />
          <Stat
            label="Unused tenant credit"
            value={usd(walletTotal)}
            hint={`Live sum of all ${num(w.tenants)} tenant wallet balances (matches the Balance column below). ${usd(cashBackedCredit)} of it is backed by confirmed payments; ${usd(grantedCredit)} is goodwill/adjustment credit.`}
            tone="bad"
          />

          <Stat
            label="Pending / unconfirmed payments"
            value={usd(mi.pending_credits)}
            hint={`${num(mi.pending_count)} awaiting confirmation · ${num(mi.failed_count)} failed or cancelled`}
          />
        </div>
      </section>

      {/* 2. How the money was used */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">2 · How the money was used</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Credits tenants spent"
            value={usd(led.debits)}
            hint={`${usd(led.debits_30d)} in the last 30 days · this is your earned revenue`}
          />
          <Stat
            label="Carrier cost of that sending"
            value={usd(u.carrier_cost)}
            hint={`${num(u.messages)} messages · ${num(u.segments)} segments · ${num(u.mms)} MMS`}
          />
          <Stat
            label="Gross profit on sending"
            value={usd(grossProfit)}
            hint="All credits debited from tenant wallets minus outbound + inbound carrier cost."
            tone={grossProfit >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Cash you should still hold"
            value={usd(cashHeld)}
            hint="Money received minus refunds issued minus everything the carrier has cost you (outbound + inbound) so far."
            tone={cashHeld >= 0 ? "good" : "bad"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Refunds issued: {usd(led.refunds)} · Credits added to wallets in total: {usd(led.topups)} · Tenants in debt
          (negative balance): {usd(w.negative_balances)} · Inbound carrier cost: {usd(inb.carrier_cost)} (
          {num(inb.messages)} inbound messages) · Goodwill/adjustment credit granted without a payment:{" "}
          {usd(grantedCredit)}
        </p>
        <p className={`text-xs ${Math.abs(ledgerDrift) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
          Reconciliation check: wallet balances {usd(rec.wallet_total)} vs transaction ledger {usd(rec.ledger_total)} ·
          drift {usd(ledgerDrift)}
          {Math.abs(ledgerDrift) > 0.01
            ? " — a wallet was changed without a matching transaction row; investigate before trusting the totals."
            : " — every wallet matches its transaction history exactly."}
        </p>

      </section>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">Per tenant</TabsTrigger>
          <TabsTrigger value="funding">Funding history</TabsTrigger>
          <TabsTrigger value="daily">Daily timeline</TabsTrigger>
          <TabsTrigger value="country">By country</TabsTrigger>
          <TabsTrigger value="margin">Margin audit</TabsTrigger>
          <TabsTrigger value="pricing">Pricing check</TabsTrigger>
          <TabsTrigger value="attempts">Send attempts</TabsTrigger>
          <TabsTrigger value="recovery">Recovery & disputes</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Every tenant: funded, spent, balance, profit</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3 text-right">Funded</th>
                    <th className="py-2 pr-3 text-right">Last funded</th>
                    <th className="py-2 pr-3 text-right">Spent</th>
                    <th className="py-2 pr-3 text-right">Refunded</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 pr-3 text-right">Messages</th>
                    <th className="py-2 pr-3 text-right">Carrier cost</th>
                    <th className="py-2 pr-3 text-right">Your profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(tenants ?? []).map((t: any) => (
                    <tr key={t.account_id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.email}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">{usd(t.funded)}</td>
                      <td className="py-2 pr-3 text-right text-xs">{date(t.last_funded_at)}</td>
                      <td className="py-2 pr-3 text-right">{usd(t.spent)}</td>
                      <td className="py-2 pr-3 text-right">{usd(t.refunded)}</td>
                      <td className={`py-2 pr-3 text-right ${Number(t.balance) < 0 ? "text-destructive" : ""}`}>
                        {usd(t.balance)}
                      </td>
                      <td className="py-2 pr-3 text-right">{num(t.messages)}</td>
                      <td className="py-2 pr-3 text-right">{usd(t.carrier_cost)}</td>
                      <td
                        className={`py-2 pr-3 text-right ${Number(t.profit) >= 0 ? "text-emerald-500" : "text-destructive"}`}
                      >
                        {usd(t.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attempts">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Recorded attempts" value={num(attempts.total_attempts)} hint="Original sends and approved retries recorded after the safety update." />
            <Stat label="Retry attempts" value={num(attempts.retry_attempts)} hint="Retries now require an explicit confirmation before sending." />
            <Stat label="Retry charges" value={usd(attempts.retry_charges)} hint="Tenant charges reserved before retry attempts leave the platform." />
            <Stat
              label="Retry margin"
              value={usd(Number(attempts.retry_charges ?? 0) - Number(attempts.retry_carrier_cost ?? 0))}
              hint={`${usd(attempts.retry_carrier_cost)} estimated carrier cost`}
              tone={Number(attempts.retry_charges ?? 0) >= Number(attempts.retry_carrier_cost ?? 0) ? "good" : "bad"}
            />
          </div>
        </TabsContent>

        <TabsContent value="recovery">
          <div className="space-y-4">
            {(recoveries ?? []).map((recovery: any) => {
              const tenant = recovery.accounts?.legal_business_name || recovery.accounts?.company || recovery.accounts?.full_name || recovery.accounts?.email || "—";
              return (
                <Card key={recovery.id}>
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                      <CardTitle className="text-base">{recovery.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{tenant}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{String(recovery.evidence_quality).replaceAll("_", " ")}</Badge>
                      <Badge>{String(recovery.status).replaceAll("_", " ")}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <Stat label="Verified funding" value={usd(recovery.verified_funding)} />
                      <Stat label="Verified debits" value={usd(recovery.verified_tenant_debits)} />
                      <Stat label="Tenant recovery" value={usd(recovery.verified_uncovered_tenant_charge)} hint="Only exact uncovered charges" />
                      <Stat label="Disputed attempts" value={num(recovery.disputed_provider_attempts)} />
                      <Stat label="Disputed amount" value={usd(recovery.disputed_provider_amount)} hint="Kept separate from tenant debt" />
                    </div>
                    <p className="text-sm text-muted-foreground">{recovery.summary}</p>
                    {recovery.evidence?.limitation && (
                      <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground">Evidence limitation: {recovery.evidence.limitation}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadRecovery(recovery.id, recovery.title)}>Download CSV</Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        try { await noticeRecoveryFn({ data: { id: recovery.id } }); toast.success("Tenant notice sent"); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Notice failed"); }
                      }}>Send tenant notice</Button>
                      <Button size="sm" onClick={() => updateRecovery.mutate({ id: recovery.id, status: "provider_credited" })}>Mark provider credited</Button>
                      <Button size="sm" variant="secondary" onClick={() => updateRecovery.mutate({ id: recovery.id, status: "provider_rejected" })}>Mark provider rejected</Button>
                      <Button size="sm" variant="outline" onClick={() => updateRecovery.mutate({ id: recovery.id, status: "closed" })}>Close case</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!recoveries?.length && <p className="text-sm text-muted-foreground">No recovery cases.</p>}
          </div>
        </TabsContent>

        <TabsContent value="funding">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last 100 funding attempts (who paid, how much, when)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Tenant</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Paid</th>
                    <th className="py-2 pr-3 text-right">Credit added</th>
                    <th className="py-2 pr-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.funding ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-3">{p.account_label}</td>
                      <td className="py-2 pr-3 capitalize">{p.provider}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {Number(p.amount ?? 0).toLocaleString()} {p.currency}
                      </td>
                      <td className="py-2 pr-3 text-right">{usd(p.credits)}</td>
                      <td className="py-2 pr-3 text-xs">{date(p.paid_at ?? p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last 30 days: money in vs money used</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3 text-right">Funded</th>
                    <th className="py-2 pr-3 text-right">Tenants spent</th>
                    <th className="py-2 pr-3 text-right">Carrier cost</th>
                    <th className="py-2 pr-3 text-right">Messages</th>
                    <th className="py-2 pr-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.daily ?? []).map((d: any) => (
                    <tr key={d.day} className="border-t border-border">
                      <td className="py-2 pr-3">{d.day}</td>
                      <td className="py-2 pr-3 text-right">{usd(d.funded)}</td>
                      <td className="py-2 pr-3 text-right">{usd(d.spent)}</td>
                      <td className="py-2 pr-3 text-right">{usd(d.carrier_cost)}</td>
                      <td className="py-2 pr-3 text-right">{num(d.messages)}</td>
                      <td className="py-2 pr-3 text-right">{usd(Number(d.spent ?? 0) - Number(d.carrier_cost ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="country">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend and cost by country</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3 text-right">Messages</th>
                    <th className="py-2 pr-3 text-right">Segments</th>
                    <th className="py-2 pr-3 text-right">MMS</th>
                    <th className="py-2 pr-3 text-right">Tenant spend</th>
                    <th className="py-2 pr-3 text-right">Carrier cost</th>
                    <th className="py-2 pr-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.by_country ?? []).map((c: any) => (
                    <tr key={c.country} className="border-t border-border">
                      <td className="py-2 pr-3">{c.country}</td>
                      <td className="py-2 pr-3 text-right">{num(c.messages)}</td>
                      <td className="py-2 pr-3 text-right">{num(c.segments)}</td>
                      <td className="py-2 pr-3 text-right">{num(c.mms)}</td>
                      <td className="py-2 pr-3 text-right">{usd(c.tenant_spend)}</td>
                      <td className="py-2 pr-3 text-right">{usd(c.carrier_cost)}</td>
                      <td className="py-2 pr-3 text-right">
                        {usd(Number(c.tenant_spend ?? 0) - Number(c.carrier_cost ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="margin">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">True margin per tenant</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <p className="text-xs text-muted-foreground mb-3">
                Charged = credits actually debited for messages handed to the carrier. True cost includes the base
                carrier rate plus carrier passthrough fees. A red margin means that tenant's traffic was sent at a loss.
              </p>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2">Tenant</th>
                    <th className="text-right">Messages</th>
                    <th className="text-right">Segments</th>
                    <th className="text-right">MMS</th>
                    <th className="text-right">Charged</th>
                    <th className="text-right">True cost</th>
                    <th className="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {(margins ?? []).map((m: any) => (
                    <tr key={m.account_id} className="border-t">
                      <td className="py-2">
                        <div className="font-medium">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="text-right tabular-nums">{num(m.messages)}</td>
                      <td className="text-right tabular-nums">{num(m.segments)}</td>
                      <td className="text-right tabular-nums">{num(m.mms_count)}</td>
                      <td className="text-right tabular-nums">{usd(m.charged)}</td>
                      <td className="text-right tabular-nums">{usd(m.true_cost)}</td>
                      <td
                        className={`text-right tabular-nums font-semibold ${
                          Number(m.margin) < 0 ? "text-destructive" : "text-emerald-500"
                        }`}
                      >
                        {usd(m.margin)}
                      </td>
                    </tr>
                  ))}
                  {!margins?.length && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        No billable traffic yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price vs true carrier cost</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <p className="text-xs text-muted-foreground mb-3">
                Suggested price is the true cost (base + passthrough fee) at a 100% markup. Rows highlighted in red are
                currently selling below what delivery actually costs.
              </p>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2">Country</th>
                    <th className="text-right">Base</th>
                    <th className="text-right">Carrier fee</th>
                    <th className="text-right">True cost</th>
                    <th className="text-right">Current price</th>
                    <th className="text-right">Margin / msg</th>
                    <th className="text-right">Suggested SMS</th>
                    <th className="text-right">Suggested MMS</th>
                  </tr>
                </thead>
                <tbody>
                  {(pricing ?? []).map((r: any) => (
                    <tr key={r.country_code} className={`border-t ${r.below_cost ? "bg-destructive/10" : ""}`}>
                      <td className="py-2">
                        {r.country_name} <span className="text-muted-foreground">({r.country_code})</span>
                      </td>
                      <td className="text-right tabular-nums">${Number(r.base_cost).toFixed(5)}</td>
                      <td className="text-right tabular-nums">${Number(r.passthrough_fee).toFixed(5)}</td>
                      <td className="text-right tabular-nums">${Number(r.true_cost).toFixed(5)}</td>
                      <td className="text-right tabular-nums">${Number(r.current_sell).toFixed(4)}</td>
                      <td
                        className={`text-right tabular-nums ${
                          r.below_cost ? "text-destructive font-semibold" : "text-emerald-500"
                        }`}
                      >
                        ${Number(r.current_margin).toFixed(5)}
                      </td>
                      <td className="text-right tabular-nums">${Number(r.suggested_sell).toFixed(4)}</td>
                      <td className="text-right tabular-nums">${Number(r.suggested_mms_sell).toFixed(4)}</td>
                    </tr>
                  ))}
                  {!pricing?.length && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-foreground">
                        No active country rates.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
