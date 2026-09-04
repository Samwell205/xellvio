import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
// Tabs no longer used — USD is the only purchase currency
import { Wallet, Settings2, CheckCircle2, Clock, XCircle, Sparkles } from "lucide-react";
import { formatUSD, formatMoney } from "@/lib/money";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveAutoRecharge } from "@/lib/billing.functions";
import { listCreditPacks, listMyPayments, verifyPaystack } from "@/lib/billing-packs.functions";
import { reconcileNowPayment } from "@/lib/nowpayments.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Billing — Xellvio" }] }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const account = useQuery({
    queryKey: ["account-billing"],
    refetchInterval: 15_000,
    queryFn: async () =>
      (await supabase.from("accounts").select("id,credit_balance,auto_recharge_enabled,auto_recharge_threshold,auto_recharge_amount,contact_email,email").maybeSingle()).data,
  });
  const tx = useQuery({
    queryKey: ["credit-transactions"],
    refetchInterval: 15_000,
    queryFn: async () =>
      (await supabase.from("credit_transactions").select("id,type,amount,balance_after,description,created_at,campaign_id").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  const packsFn = useServerFn(listCreditPacks);
  const paymentsFn = useServerFn(listMyPayments);
  const verifyFn = useServerFn(verifyPaystack);
  const reconcileNpFn = useServerFn(reconcileNowPayment);

  const packs = useQuery({ queryKey: ["credit-packs"], queryFn: () => packsFn() });
  const payments = useQuery({ queryKey: ["my-payments"], queryFn: () => paymentsFn(), refetchInterval: 15_000 });

  const callAuto = useServerFn(saveAutoRecharge);
  const [auto, setAuto] = useState({ enabled: false, threshold: 10, amount: 25 });
  useEffect(() => {
    if (!account.data) return;
    setAuto({
      enabled: !!account.data.auto_recharge_enabled,
      threshold: Number(account.data.auto_recharge_threshold ?? 10),
      amount: Number(account.data.auto_recharge_amount ?? 25),
    });
  }, [account.data]);
  const saveAuto = useMutation({
    mutationFn: async () => callAuto({ data: auto }),
    onSuccess: () => {
      toast.success("Auto-recharge updated");
      qc.invalidateQueries({ queryKey: ["account-billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Handle redirect-back ?ref= — Paystack (pmt_/pay_) or NOWPayments (npm_)
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;
    const clearRef = () => {
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
    };
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["account-billing"] });
      qc.invalidateQueries({ queryKey: ["credit-transactions"] });
      qc.invalidateQueries({ queryKey: ["my-payments"] });
    };
    if (ref.startsWith("npm_")) {
      // Poll for a couple of minutes — ETH/BTC confirmations take time
      let cancelled = false;
      let attempt = 0;
      const maxAttempts = 12; // ~2 minutes at 10s
      const poll = async () => {
        attempt += 1;
        try {
          const r = await reconcileNpFn({ data: { reference: ref } });
          if (r.status === "credited") {
            toast.success("Payment confirmed — credits added");
            invalidate();
            clearRef();
            return;
          }
          if (r.status === "already_paid") { invalidate(); clearRef(); return; }
          if (r.status === "failed" || r.status === "expired" || r.status === "refunded" || r.status === "duplicate") {
            toast.message(`Payment status: ${r.status}`);
            invalidate();
            clearRef();
            return;
          }
          if (attempt === 1) toast.message("Waiting for on-chain confirmation…");
          if (attempt < maxAttempts && !cancelled) setTimeout(poll, 10_000);
          else clearRef();
        } catch (e: any) {
          if (attempt < maxAttempts && !cancelled) setTimeout(poll, 10_000);
          else { toast.error(e.message); clearRef(); }
        }
      };
      poll();
      return () => { cancelled = true; };
    }
    verifyFn({ data: { reference: ref } })
      .then((r) => {
        if (r.status === "success") toast.success("Payment confirmed — credits added");
        else toast.message(`Payment status: ${r.status}`);
        invalidate();
      })
      .catch((e) => toast.error(e.message))
      .finally(clearRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balance = Number(account.data?.credit_balance ?? 0);
  // Show USD packs only — Paystack still charges in NGN behind the scenes
  // using the admin-configured FX rate, but customers shop in USD.
  const usdPacks = (packs.data ?? []).filter((p) => p.currency === "USD");

  const spend30d = (tx.data ?? [])
    .filter((t) => t.type === "debit" && new Date(t.created_at).getTime() > Date.now() - 30 * 86400_000)
    .reduce((s, t) => s + Number(t.amount), 0);
  const lastPaid = (payments.data ?? []).find((p) => p.status === "paid");

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments & invoices" },
    { id: "preferences", label: "Preferences" },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Wallet className="size-6" /> Billing
        </h1>
        <p className="text-sm text-muted-foreground">Your balance, payments and top-up preferences.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Available balance</div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums">{formatUSD(balance)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Credits are used as your messages go out.</p>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Spent in the last 30 days</div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums">{formatUSD(spend30d)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Across all campaigns and replies.</p>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</div>
              <div className="mt-1 text-lg font-semibold capitalize">{lastPaid?.provider ?? "Card or crypto"}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {lastPaid ? `Last payment ${new Date(lastPaid.created_at).toLocaleDateString()}` : "Choose at checkout — nothing is stored here."}
              </p>
            </Card>
          </div>

          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h3 className="font-semibold">Add credits</h3></div>
              <span className="text-xs text-muted-foreground">Priced in USD · pay by card or crypto</span>
            </div>
            <PackPicker packs={usdPacks.filter((p) => Number(p.price) <= 500)} />
            <p className="text-xs text-muted-foreground">
              Messages are billed per recipient at the country rate × segments. We never debit more than your available
              balance — anything your balance can't cover is skipped, not charged.
            </p>
          </Card>
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Payment history</h3>
            {(payments.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left">When</th>
                      <th className="p-3 text-left">Provider</th>
                      <th className="p-3 text-left">Amount</th>
                      <th className="p-3 text-left">Credits</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data!.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="p-3 capitalize">{p.provider}</td>
                        <td className="p-3 tabular-nums">{formatMoney(Number(p.amount), p.currency)}</td>
                        <td className="p-3 tabular-nums">{formatUSD(Number(p.credits))}</td>
                        <td className="p-3"><PaymentStatus s={p.status} /></td>
                        <td className="max-w-[180px] truncate p-3 font-mono text-xs text-muted-foreground">{p.provider_reference ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Credit ledger</h3>
            {(tx.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="p-3 text-left">When</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Description</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Balance after</th></tr>
                  </thead>
                  <tbody>
                    {tx.data!.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="p-3"><TypeBadge type={t.type} /></td>
                        <td className="max-w-xs truncate p-3">{t.description ?? "—"}</td>
                        <td className={`p-3 text-right font-medium tabular-nums ${t.type === "topup" || t.type === "refund" ? "text-success" : "text-destructive"}`}>
                          {t.type === "topup" || t.type === "refund" ? "+" : "−"}{formatUSD(Number(t.amount))}
                        </td>
                        <td className="p-3 text-right tabular-nums">{formatUSD(Number(t.balance_after))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "preferences" && (
        <Card className="max-w-2xl space-y-4 p-6">
          <div className="flex items-center gap-2"><Settings2 className="size-5 text-primary" /><h3 className="font-semibold">Auto top-up</h3></div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Automatically add funds when balance is low</div>
              <p className="text-xs text-muted-foreground">Requires a saved card (coming soon).</p>
            </div>
            <Switch checked={auto.enabled} onCheckedChange={(v) => setAuto({ ...auto, enabled: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>When balance falls below</Label>
              <Input type="number" min={1} value={auto.threshold} onChange={(e) => setAuto({ ...auto, threshold: Number(e.target.value) })} disabled={!auto.enabled} />
            </div>
            <div>
              <Label>Add this amount (USD credits)</Label>
              <Input type="number" min={1} value={auto.amount} onChange={(e) => setAuto({ ...auto, amount: Number(e.target.value) })} disabled={!auto.enabled} />
            </div>
          </div>
          <Button onClick={() => saveAuto.mutate()} disabled={saveAuto.isPending} variant="outline">Save auto top-up</Button>
        </Card>
      )}
    </div>
  );
}

function PackPicker({ packs }: { packs: any[] }) {
  const CUSTOM = "__custom__";
  const navigate = useNavigate();

  const defaultId = packs.find((p) => p.is_popular)?.id ?? packs[0]?.id ?? CUSTOM;
  const [selected, setSelected] = useState<string>(defaultId);
  const [customAmount, setCustomAmount] = useState<number>(50);

  useEffect(() => {
    const url = new URL(window.location.href);
    const pack = url.searchParams.get("pack");
    const amt = url.searchParams.get("amount");
    if (amt && Number(amt) > 0) {
      setSelected(CUSTOM);
      setCustomAmount(Math.min(10000, Math.max(5, Number(amt))));
    } else if (pack && packs.some((p) => p.id === pack)) {
      setSelected(pack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs.length]);

  useEffect(() => {
    if (!packs.length) return;
    if (selected !== CUSTOM && !packs.some((p) => p.id === selected)) {
      setSelected(packs.find((p) => p.is_popular)?.id ?? packs[0].id);
    }
  }, [packs, selected]);

  const pack = packs.find((p) => p.id === selected);
  const isCustom = selected === CUSTOM;
  const amount = isCustom ? customAmount : Number(pack?.price ?? 0);
  const credits = isCustom ? customAmount : Number(pack?.credits ?? 0);

  function goCheckout() {
    const search: Record<string, any> = isCustom ? { amount: customAmount } : { pack: selected };
    navigate({ to: "/app/checkout", search });
  }

  if (!packs.length) {
    return <p className="text-sm text-muted-foreground">No packs available. Ask the admin to create one.</p>;
  }

  return (
    <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
      <div className="space-y-3">
        <div>
          <Label>Choose a pack</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {packs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatUSD(Number(p.price))} ({formatUSD(Number(p.credits))} credits){p.is_popular ? " · Popular" : ""}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom amount…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCustom && (
          <div>
            <Label>Custom amount (USD)</Label>
            <Input
              type="number"
              min={5}
              max={10000}
              step={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">1 USD = 1 credit · min $5, max $10,000</p>
          </div>
        )}
        {amount < 25 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
            <strong>Heads up:</strong> Crypto payments (USDT, BTC, etc.) usually require at least <strong>$25</strong> to clear the network's minimum. For amounts under $25, please pay by <strong>card</strong> — or pick the Growth ($25) pack or higher for crypto.
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-muted/30 p-4 min-w-[220px]">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">You pay</div>
        <div className="text-3xl font-extrabold tabular-nums">{formatUSD(amount)}</div>
        <div className="text-sm text-muted-foreground">≈ {formatUSD(credits)} in credits</div>
        <Button
          className="mt-3 w-full"
          onClick={goCheckout}
          disabled={isCustom && (customAmount < 5 || customAmount > 10000)}
        >
          Pay
        </Button>
      </div>
    </div>
  );
}




function PaymentStatus({ s }: { s: string }) {
  if (s === "paid") return <Badge variant="default" className="gap-1"><CheckCircle2 className="size-3" />Paid</Badge>;
  if (s === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="size-3" />Pending</Badge>;
  if (s === "failed" || s === "cancelled") return <Badge variant="destructive" className="gap-1"><XCircle className="size-3" />{s}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    topup: { label: "Top-up", variant: "default" },
    debit: { label: "Debit", variant: "secondary" },
    refund: { label: "Refund", variant: "outline" },
    rollover: { label: "Rollover", variant: "outline" },
  };
  const m = map[type] ?? { label: type, variant: "outline" as const };
  return <Badge variant={m.variant} className="capitalize">{m.label}</Badge>;
}
