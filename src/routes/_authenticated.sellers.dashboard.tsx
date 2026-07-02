import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  becomeSeller, getSellerStatus,
  listNigerianBanks, resolveBankAccount, getMyPayoutAccount, savePayoutAccount,
  listMyListings, listMyLedger,
  requestWithdrawal, listMyWithdrawals,
} from "@/lib/marketplace.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { ArrowLeft, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sellers/dashboard")({
  component: SellerDashboard,
});

function SellerDashboard() {
  const getStatus = useServerFn(getSellerStatus);
  const become = useServerFn(becomeSeller);
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["seller-status"], queryFn: () => getStatus() });

  if (status.isLoading) return <Shell><div className="p-8 text-muted-foreground">Loading…</div></Shell>;

  if (!status.data?.isSeller) {
    return (
      <Shell>
        <div className="max-w-lg mx-auto mt-16">
          <Card>
            <CardHeader><CardTitle>Become a seller</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sellers verify toll-free numbers and get paid when businesses buy them. Confirm to activate your seller dashboard.
              </p>
              <Button onClick={async () => { await become(); toast.success("Welcome!"); qc.invalidateQueries({ queryKey: ["seller-status"] }); }}>
                Activate seller account
              </Button>
            </CardContent>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Available balance" value={`$${status.data.balance.toFixed(2)}`} />
        <Stat label="Lifetime earnings" value={`$${status.data.lifetimeEarnings.toFixed(2)}`} />
        <Stat label="Buyer price / your payout" value={`$${status.data.pricing.buyerPrice} → $${status.data.pricing.sellerPayout}`} />
      </div>
      <Tabs defaultValue="numbers" className="mt-6">
        <TabsList>
          <TabsTrigger value="numbers">My numbers</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="numbers"><MyNumbers/></TabsContent>
        <TabsContent value="payouts"><PayoutAccount/></TabsContent>
        <TabsContent value="withdrawals"><Withdrawals balance={status.data.balance} /></TabsContent>
        <TabsContent value="ledger"><Ledger/></TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-4">
          <Logo />
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Sellers</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="size-3.5"/>Tenant app</Link>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href="/"; }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><LogOut className="size-3.5"/>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

function MyNumbers() {
  const fn = useServerFn(listMyListings);
  const q = useQuery({ queryKey: ["seller-listings"], queryFn: () => fn() });
  return (
    <Card className="mt-4"><CardHeader><CardTitle className="text-base">My numbers</CardTitle></CardHeader>
      <CardContent>
        {!q.data?.length ? (
          <div className="text-sm text-muted-foreground">
            No numbers yet. Verify a toll-free number in the tenant app under <Link to="/app/toll-free-verification" className="underline">Toll-free verification</Link>. Once approved, it appears here and becomes available on the marketplace.
          </div>
        ) : (
          <div className="divide-y">
            {q.data.map((l: any) => (
              <div key={l.id} className="py-2 flex items-center gap-3 text-sm">
                <div className="font-mono">{l.phone_number ?? "—"}</div>
                <Badge variant={l.status === "sold" ? "default" : l.status === "available" ? "secondary" : "outline"}>{l.status}</Badge>
                <div className="ml-auto text-muted-foreground">{l.sold_at ? `Sold ${new Date(l.sold_at).toLocaleDateString()}` : new Date(l.created_at).toLocaleDateString()}</div>
                {l.seller_payout_amount && <div className="tabular-nums font-medium">+${Number(l.seller_payout_amount).toFixed(2)}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
  );
}

function PayoutAccount() {
  const banksFn = useServerFn(listNigerianBanks);
  const resolveFn = useServerFn(resolveBankAccount);
  const getFn = useServerFn(getMyPayoutAccount);
  const saveFn = useServerFn(savePayoutAccount);
  const qc = useQueryClient();
  const banks = useQuery({ queryKey: ["ng-banks"], queryFn: () => banksFn() });
  const current = useQuery({ queryKey: ["my-payout"], queryFn: () => getFn() });
  const [bankCode, setBankCode] = useState("");
  const [accNum, setAccNum] = useState("");
  const [resolved, setResolved] = useState<{ account_name: string } | null>(null);

  return (
    <Card className="mt-4"><CardHeader><CardTitle className="text-base">Bank account for payouts</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {current.data && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div><span className="text-muted-foreground">Current: </span><strong>{current.data.account_name}</strong></div>
            <div className="text-muted-foreground">{current.data.bank_name} • {current.data.account_number}</div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger><SelectValue placeholder="Select bank"/></SelectTrigger>
              <SelectContent className="max-h-72">
                {(banks.data ?? []).map((b: any) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Account number (10 digits)</Label>
            <Input value={accNum} onChange={(e)=>{setAccNum(e.target.value); setResolved(null);}} maxLength={10} inputMode="numeric"/>
          </div>
        </div>
        {resolved && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            Verified: <strong>{resolved.account_name}</strong>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" disabled={!bankCode || accNum.length !== 10} onClick={async () => {
            try { const r = await resolveFn({ data: { bank_code: bankCode, account_number: accNum }}); setResolved(r); }
            catch (e: any) { toast.error(e.message); }
          }}>Verify account</Button>
          <Button disabled={!resolved} onClick={async () => {
            const bankName = (banks.data ?? []).find((b: any) => b.code === bankCode)?.name ?? "";
            try {
              await saveFn({ data: { bank_code: bankCode, bank_name: bankName, account_number: accNum }});
              toast.success("Bank account saved"); qc.invalidateQueries({ queryKey: ["my-payout"] });
            } catch (e: any) { toast.error(e.message); }
          }}>Save</Button>
        </div>
      </CardContent></Card>
  );
}

function Withdrawals({ balance }: { balance: number }) {
  const reqFn = useServerFn(requestWithdrawal);
  const listFn = useServerFn(listMyWithdrawals);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-withdrawals"], queryFn: () => listFn() });
  const [amount, setAmount] = useState("");
  const mut = useMutation({
    mutationFn: async () => reqFn({ data: { amount: Number(amount) }}),
    onSuccess: () => { toast.success("Withdrawal requested — admin will process it manually."); setAmount(""); qc.invalidateQueries({ queryKey: ["my-withdrawals"] }); qc.invalidateQueries({ queryKey: ["seller-status"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="mt-4 space-y-4">
      <Card><CardHeader><CardTitle className="text-base">Request a withdrawal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Available: <strong className="text-foreground">${balance.toFixed(2)}</strong> • Minimum $5</p>
          <div className="flex gap-2">
            <Input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="Amount USD" inputMode="decimal" className="max-w-xs"/>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !amount}>Request withdrawal</Button>
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent>
          {!q.data?.length ? <div className="text-sm text-muted-foreground">No withdrawals yet.</div> : (
            <div className="divide-y">
              {q.data.map((w: any) => (
                <div key={w.id} className="py-2 text-sm flex items-center gap-3">
                  <div className="tabular-nums font-medium">${Number(w.amount).toFixed(2)}</div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>{w.status}</Badge>
                  <div className="text-muted-foreground">{new Date(w.created_at).toLocaleString()}</div>
                  {w.admin_notes && <div className="text-muted-foreground italic">— {w.admin_notes}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Ledger() {
  const fn = useServerFn(listMyLedger);
  const q = useQuery({ queryKey: ["seller-ledger"], queryFn: () => fn() });
  return (
    <Card className="mt-4"><CardContent className="p-4">
      {!q.data?.length ? <div className="text-sm text-muted-foreground">No transactions yet.</div> : (
        <div className="divide-y">
          {q.data.map((l: any) => (
            <div key={l.id} className="py-2 text-sm flex items-center gap-3">
              <Badge variant="outline">{l.type}</Badge>
              <div className="flex-1 text-muted-foreground">{l.description}</div>
              <div className={`tabular-nums font-medium ${Number(l.amount) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                {Number(l.amount) >= 0 ? "+" : ""}${Number(l.amount).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums w-20 text-right">${Number(l.balance_after).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </CardContent></Card>
  );
}
