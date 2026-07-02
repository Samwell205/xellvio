import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminListListings, adminListWithdrawals, adminMarkWithdrawal,
  adminGetPricing, adminSetPricing,
} from "@/lib/marketplace.functions";
import { AdminSidebar } from "@/components/AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/marketplace")({
  component: AdminMarketplace,
});

function AdminMarketplace() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 bg-background/80 backdrop-blur border-b flex items-center gap-3 px-4">
            <SidebarTrigger />
            <h1 className="font-semibold">Marketplace</h1>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto space-y-4">
            <Tabs defaultValue="listings">
              <TabsList>
                <TabsTrigger value="listings">Listings</TabsTrigger>
                <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>
              <TabsContent value="listings"><Listings/></TabsContent>
              <TabsContent value="withdrawals"><Withdrawals/></TabsContent>
              <TabsContent value="pricing"><Pricing/></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Listings() {
  const fn = useServerFn(adminListListings);
  const q = useQuery({ queryKey: ["admin-listings"], queryFn: () => fn() });
  return (
    <Card className="mt-4"><CardContent className="p-0">
      <div className="divide-y">
        {(q.data ?? []).map((r: any) => (
          <div key={r.id} className="p-3 grid grid-cols-6 gap-2 text-sm items-center">
            <div className="font-mono">{r.phone_number ?? "—"}</div>
            <Badge variant="outline">{r.status}</Badge>
            <div>Seller: {r.seller_name ?? "—"}</div>
            <div>Buyer: {r.buyer_name ?? "—"}</div>
            <div className="tabular-nums">{r.buyer_price_amount ? `$${Number(r.buyer_price_amount).toFixed(2)}` : "—"}</div>
            <div className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</div>
          </div>
        ))}
        {!q.data?.length && <div className="p-6 text-sm text-muted-foreground">No listings yet.</div>}
      </div>
    </CardContent></Card>
  );
}

function Withdrawals() {
  const listFn = useServerFn(adminListWithdrawals);
  const markFn = useServerFn(adminMarkWithdrawal);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-withdrawals"], queryFn: () => listFn() });
  const mark = useMutation({
    mutationFn: (v: { id: string; status: "paid"|"rejected"; notes?: string }) => markFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="mt-4"><CardContent className="p-0">
      <div className="divide-y">
        {(q.data ?? []).map((r: any) => {
          const p = r.payout_account_snapshot ?? {};
          return (
            <div key={r.id} className="p-3 space-y-2 text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="tabular-nums font-semibold">${Number(r.amount).toFixed(2)}</div>
                <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
                <div>{r.seller_name}</div>
                <div className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {p.bank_name} • {p.account_name} • {p.account_number}
              </div>
              {r.admin_notes && <div className="text-xs italic">Notes: {r.admin_notes}</div>}
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => mark.mutate({ id: r.id, status: "paid" })}>Mark paid</Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    const notes = prompt("Reason for rejection?") ?? "";
                    mark.mutate({ id: r.id, status: "rejected", notes });
                  }}>Reject</Button>
                </div>
              )}
            </div>
          );
        })}
        {!q.data?.length && <div className="p-6 text-sm text-muted-foreground">No withdrawal requests.</div>}
      </div>
    </CardContent></Card>
  );
}

function Pricing() {
  const getFn = useServerFn(adminGetPricing);
  const setFn = useServerFn(adminSetPricing);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-pricing"], queryFn: () => getFn() });
  const [buyer, setBuyer] = useState("");
  const [payout, setPayout] = useState("");
  const [fee, setFee] = useState("");
  const seeded = q.data && buyer === "" ? (setBuyer(String(q.data.buyerPrice)), setPayout(String(q.data.sellerPayout)), setFee(String(q.data.verificationFee)), true) : false;
  void seeded;
  return (
    <Card className="mt-4"><CardHeader><CardTitle className="text-base">Marketplace pricing</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div><Label>Buyer price (USD)</Label><Input value={buyer} onChange={(e)=>setBuyer(e.target.value)} inputMode="decimal"/></div>
        <div><Label>Seller payout (USD)</Label><Input value={payout} onChange={(e)=>setPayout(e.target.value)} inputMode="decimal"/></div>
        <div><Label>Seller verification fee (USD)</Label><Input value={fee} onChange={(e)=>setFee(e.target.value)} inputMode="decimal"/></div>
        <Button onClick={async () => {
          try {
            await setFn({ data: { buyerPrice: Number(buyer), sellerPayout: Number(payout), verificationFee: Number(fee) }});
            toast.success("Pricing updated"); qc.invalidateQueries({ queryKey: ["admin-pricing"] });
          } catch (e: any) { toast.error(e.message); }
        }}>Save</Button>
      </CardContent>
    </Card>
  );
}
