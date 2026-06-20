import { createFileRoute } from "@tanstack/react-router";
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
import { listCreditPacks, initPaystackCheckout, listMyPayments, verifyPaystack } from "@/lib/billing-packs.functions";
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

  // Handle Paystack redirect-back ?ref=
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;
    verifyFn({ data: { reference: ref } })
      .then((r) => {
        if (r.status === "success") toast.success("Payment confirmed — credits added");
        else toast.message(`Payment status: ${r.status}`);
        qc.invalidateQueries({ queryKey: ["account-billing"] });
        qc.invalidateQueries({ queryKey: ["credit-transactions"] });
        qc.invalidateQueries({ queryKey: ["my-payments"] });
      })
      .catch((e) => toast.error(e.message))
      .finally(() => {
        url.searchParams.delete("ref");
        window.history.replaceState({}, "", url.toString());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balance = Number(account.data?.credit_balance ?? 0);
  // Show USD packs only — Paystack still charges in NGN behind the scenes
  // using the admin-configured FX rate, but customers shop in USD.
  const usdPacks = (packs.data ?? []).filter((p) => p.currency === "USD");

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Wallet className="size-6" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Buy credits, view payments, and manage auto top-ups.</p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="text-xs uppercase text-muted-foreground tracking-wide">Current balance</div>
        <div className="text-4xl font-extrabold mt-1">{formatUSD(balance)}</div>
        <p className="text-xs text-muted-foreground mt-2">SMS are billed per recipient at the country rate × segments. We never debit more than your available balance — any messages your balance can't cover are skipped, not charged.</p>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h3 className="font-semibold">Buy credits</h3></div>
          <span className="text-xs text-muted-foreground">Priced in USD · paid securely via Paystack</span>
        </div>
        <PackGrid packs={usdPacks} />
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Payment history</h3>
        {(payments.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Provider</th>
                  <th className="text-left p-3">Amount</th>
                  <th className="text-left p-3">Credits</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Reference</th>
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
                    <td className="p-3 text-xs font-mono text-muted-foreground truncate max-w-[180px]">{p.provider_reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Settings2 className="size-5 text-primary" /><h3 className="font-semibold">Auto top-up</h3></div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Automatically add funds when balance is low</div>
            <p className="text-xs text-muted-foreground">Requires a saved Paystack card (coming soon).</p>
          </div>
          <Switch checked={auto.enabled} onCheckedChange={(v) => setAuto({ ...auto, enabled: v })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
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

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Credit ledger</h3>
        {(tx.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr><th className="text-left p-3">When</th><th className="text-left p-3">Type</th><th className="text-left p-3">Description</th><th className="text-right p-3">Amount</th><th className="text-right p-3">Balance after</th></tr>
              </thead>
              <tbody>
                {tx.data!.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="p-3"><TypeBadge type={t.type} /></td>
                    <td className="p-3 truncate max-w-xs">{t.description ?? "—"}</td>
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
  );
}

function PackGrid({ packs }: { packs: any[] }) {
  if (!packs?.length) {
    return <p className="text-sm text-muted-foreground">No packs available in this currency. Ask the admin to create one.</p>;
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {packs.map((p) => (
        <PackCard key={p.id} pack={p} />
      ))}
    </div>
  );
}

function PackCard({ pack }: { pack: any }) {
  const initFn = useServerFn(initPaystackCheckout);

  const buy = useMutation({
    mutationFn: async () => initFn({ data: { packId: pack.id } }),
    onSuccess: (r) => { window.location.href = r.authorization_url; },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className={`p-5 flex flex-col gap-3 ${pack.is_popular ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{pack.name}</div>
          <div className="text-xs text-muted-foreground">{pack.description ?? "\u00A0"}</div>
        </div>
        {pack.is_popular && <Badge>Popular</Badge>}
      </div>
      <div className="text-3xl font-extrabold">{formatMoney(Number(pack.price), pack.currency)}</div>
      <div className="text-sm text-muted-foreground">≈ {formatUSD(Number(pack.credits))} in credits</div>
      <Button className="mt-auto" onClick={() => buy.mutate()} disabled={buy.isPending}>
        {buy.isPending ? "Redirecting…" : "Pay with Paystack"}
      </Button>
    </Card>
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
