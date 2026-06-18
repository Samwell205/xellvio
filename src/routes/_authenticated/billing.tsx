import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addCredits } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, CreditCard } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Samwell Global SMS" }] }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: async () => (await supabase.from("wallets").select("*").maybeSingle()).data });
  const tx = useQuery({ queryKey: ["transactions"], queryFn: async () => (await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const topup = useServerFn(addCredits);
  const [picked, setPicked] = useState(500);
  const mut = useMutation({
    mutationFn: () => topup({ data: { amount: picked } }),
    onSuccess: () => { toast.success(`Added ${picked} credits (demo)`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const packs = [100, 500, 2000, 10000];

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold">Billing</h1><p className="text-sm text-muted-foreground">Manage credits, transactions, and payment methods.</p></div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 md:col-span-1">
          <div className="flex items-center gap-3"><div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Wallet className="size-5" /></div><span className="font-semibold">Wallet balance</span></div>
          <div className="mt-4 text-4xl font-extrabold">{Number(wallet.data?.balance_credits ?? 0).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">credits available</div>
        </Card>
        <Card className="p-6 md:col-span-2">
          <h3 className="font-semibold">Top up credits</h3>
          <p className="text-sm text-muted-foreground">Paystack &amp; Payoneer checkout coming soon. Use demo top-up below to test.</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {packs.map((p) => (
              <button key={p} onClick={() => setPicked(p)} className={`rounded-lg border p-3 text-center transition ${picked === p ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:border-primary/40"}`}>
                <div className="font-bold">{p.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">credits</div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}><CreditCard className="size-4 mr-1" /> Demo top-up {picked}</Button>
            <Button variant="outline" disabled>Pay with Paystack</Button>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Transactions</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase border-b"><tr><th className="text-left py-2">Date</th><th className="text-left py-2">Kind</th><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th></tr></thead>
          <tbody>
            {(tx.data ?? []).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No transactions yet.</td></tr>}
            {(tx.data ?? []).map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2.5 text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                <td className="py-2.5 capitalize">{t.kind}</td>
                <td className="py-2.5">{t.description}</td>
                <td className={`py-2.5 text-right font-semibold ${Number(t.amount) > 0 ? "text-success" : "text-destructive"}`}>{Number(t.amount) > 0 ? "+" : ""}{t.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
