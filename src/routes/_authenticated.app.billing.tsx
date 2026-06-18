import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, Settings2, Info } from "lucide-react";
import { formatUSD } from "@/lib/money";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addFunds, saveAutoRecharge } from "@/lib/billing.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Billing — Samwell Global SMS" }] }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const account = useQuery({
    queryKey: ["account-billing"],
    refetchInterval: 15_000,
    queryFn: async () => (await supabase.from("accounts").select("id,credit_balance,auto_recharge_enabled,auto_recharge_threshold,auto_recharge_amount").maybeSingle()).data,
  });
  const tx = useQuery({
    queryKey: ["credit-transactions"],
    refetchInterval: 15_000,
    queryFn: async () => (await supabase.from("credit_transactions").select("id,type,amount,balance_after,description,created_at,campaign_id").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  const callAdd = useServerFn(addFunds);
  const callAuto = useServerFn(saveAutoRecharge);

  const [amount, setAmount] = useState("25");
  const [auto, setAuto] = useState({ enabled: false, threshold: 10, amount: 25 });

  // Sync from account on first load
  if (account.data && !auto.enabled && account.data.auto_recharge_enabled && auto.threshold === 10 && auto.amount === 25) {
    setAuto({
      enabled: !!account.data.auto_recharge_enabled,
      threshold: Number(account.data.auto_recharge_threshold ?? 10),
      amount: Number(account.data.auto_recharge_amount ?? 25),
    });
  }

  const topup = useMutation({
    mutationFn: async (amt: number) => callAdd({ data: { amount: amt } }),
    onSuccess: (r) => {
      toast.success(`Added ${formatUSD(r.amount)}. New balance: ${formatUSD(r.balance_after)}`);
      qc.invalidateQueries({ queryKey: ["account-billing"] });
      qc.invalidateQueries({ queryKey: ["credit-transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAuto = useMutation({
    mutationFn: async () => callAuto({ data: auto }),
    onSuccess: () => {
      toast.success("Auto-recharge updated");
      qc.invalidateQueries({ queryKey: ["account-billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = Number(account.data?.credit_balance ?? 0);
  const presets = [25, 50, 100, 250, 500, 1000];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Wallet className="size-6" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Add funds, manage auto top-ups, and review transactions.</p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="text-xs uppercase text-muted-foreground tracking-wide">Current balance</div>
        <div className="text-4xl font-extrabold mt-1">{formatUSD(balance)}</div>
        <p className="text-xs text-muted-foreground mt-2">Each SMS is charged at your recipient's country rate × segments. Funds are deducted per message sent.</p>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Plus className="size-5 text-primary" /><h3 className="font-semibold">Add funds</h3></div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p} variant={amount === String(p) ? "default" : "outline"} size="sm" onClick={() => setAmount(String(p))}>
              {formatUSD(p)}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-[200px]">
            <Label>Custom amount (USD)</Label>
            <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button onClick={() => topup.mutate(Number(amount))} disabled={topup.isPending || !(Number(amount) > 0)}>
            {topup.isPending ? "Processing…" : `Add ${formatUSD(Number(amount) || 0)}`}
          </Button>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-md p-3">
          <Info className="size-4 mt-0.5" />
          <div>Payment provider integration (Stripe/Mollie) coming soon. For now top-ups are simulated and credited to your balance instantly.</div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Settings2 className="size-5 text-primary" /><h3 className="font-semibold">Auto top-up</h3></div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Automatically add funds when balance is low</div>
            <p className="text-xs text-muted-foreground">Never run out of funds mid-campaign.</p>
          </div>
          <Switch checked={auto.enabled} onCheckedChange={(v) => setAuto({ ...auto, enabled: v })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>When balance falls below</Label>
            <Input type="number" min={1} value={auto.threshold} onChange={(e) => setAuto({ ...auto, threshold: Number(e.target.value) })} disabled={!auto.enabled} />
            <p className="text-xs text-muted-foreground mt-1">Current threshold: {formatUSD(auto.threshold)}</p>
          </div>
          <div>
            <Label>Add this amount</Label>
            <Input type="number" min={1} value={auto.amount} onChange={(e) => setAuto({ ...auto, amount: Number(e.target.value) })} disabled={!auto.enabled} />
            <p className="text-xs text-muted-foreground mt-1">Refill amount: {formatUSD(auto.amount)}</p>
          </div>
        </div>
        <Button onClick={() => saveAuto.mutate()} disabled={saveAuto.isPending} variant="outline">Save auto top-up</Button>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Transaction history</h3>
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
