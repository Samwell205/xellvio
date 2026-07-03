import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminListVerifiers,
  adminListTfns,
  adminUpdateTfnStatus,
  adminAssignTfnToAccount,
  adminListWithdrawals,
  adminMarkWithdrawalPaid,
  adminRejectWithdrawal,
  adminGetTfnSettings,
  adminSetTfnSettings,
  adminListAccountsLite,
  adminSetVerifierActive,
  adminAdjustVerifierWallet,
  adminDeleteVerifierTfn,
  adminListSoldTfns,
  adminListTwilioApprovedTfns,
  adminAssignTwilioNumberToAccount,
  adminUnassignSenderAsset,
} from "@/lib/admin-verifiers.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/verifiers")({
  component: AdminVerifiersPage,
});

function AdminVerifiersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verified TFN Marketplace</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage independent verifiers, their submitted numbers, sales, and payouts.</p>
      </div>
      <Tabs defaultValue="verifiers">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="verifiers">Verifiers</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="pool">Verified pool</TabsTrigger>
          <TabsTrigger value="sold">Sold / payouts</TabsTrigger>
          <TabsTrigger value="twilio">Twilio approved</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="verifiers"><VerifiersTab /></TabsContent>
        <TabsContent value="submissions"><SubmissionsTab /></TabsContent>
        <TabsContent value="pool"><PoolTab /></TabsContent>
        <TabsContent value="sold"><SoldTab /></TabsContent>
        <TabsContent value="twilio"><TwilioTab /></TabsContent>
        <TabsContent value="withdrawals"><WithdrawalsTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function VerifiersTab() {
  const list = useServerFn(adminListVerifiers);
  const setActive = useServerFn(adminSetVerifierActive);
  const adjust = useServerFn(adminAdjustVerifierWallet);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "verifiers"], queryFn: () => list() });
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});

  const toggleMut = useMutation({
    mutationFn: (a: { id: string; on: boolean }) => setActive({ data: { verifier_id: a.id, is_active: a.on } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin", "verifiers"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const adjustMut = useMutation({
    mutationFn: (a: { id: string; delta: number; reason: string }) =>
      adjust({ data: { verifier_id: a.id, delta_ngn: a.delta, reason: a.reason } }),
    onSuccess: () => {
      toast.success("Wallet updated");
      qc.invalidateQueries({ queryKey: ["admin", "verifiers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>All verifiers</CardTitle></CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No verifiers yet.</div> : (
          <div className="space-y-3">
            {(data ?? []).map((v: any) => (
              <div key={v.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{v.full_name} {v.is_active === false && <Badge variant="destructive" className="ml-2">Suspended</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{v.email} · joined {new Date(v.created_at).toLocaleDateString()}</div>
                    <div className="text-xs mt-1">
                      Wallet: <b>₦{Number(v.wallet?.balance_ngn ?? 0).toLocaleString()}</b> · Earned: ₦{Number(v.wallet?.lifetime_earned_ngn ?? 0).toLocaleString()}
                    </div>
                    {v.bank ? (
                      <div className="text-xs text-muted-foreground mt-1">Bank: {v.bank.bank_name} · {v.bank.account_number} · {v.bank.account_name}</div>
                    ) : <div className="text-xs text-amber-600 mt-1">No bank details</div>}
                    <div className="flex flex-wrap gap-1 mt-2 text-xs">
                      <Badge variant="outline">Submitted: {v.stats?.total ?? 0}</Badge>
                      <Badge variant="secondary">Pending: {v.stats?.pending ?? 0}</Badge>
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Verified: {v.stats?.verified ?? 0}</Badge>
                      <Badge variant="destructive">Rejected: {v.stats?.rejected ?? 0}</Badge>
                      <Badge className="bg-blue-600 hover:bg-blue-600">Sold: {v.stats?.sold ?? 0}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant={v.is_active === false ? "default" : "outline"} onClick={() => toggleMut.mutate({ id: v.id, on: v.is_active === false })}>
                    {v.is_active === false ? "Reactivate" : "Suspend"}
                  </Button>
                </div>
                <div className="flex items-end gap-2 pt-2 border-t">
                  <div className="flex-1">
                    <Label className="text-xs">Adjust wallet (₦, negative to debit)</Label>
                    <Input type="number" placeholder="e.g. 5000 or -2000" value={amountMap[v.id] ?? ""} onChange={(e) => setAmountMap({ ...amountMap, [v.id]: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Reason</Label>
                    <Input placeholder="Bonus / correction / clawback" value={reasonMap[v.id] ?? ""} onChange={(e) => setReasonMap({ ...reasonMap, [v.id]: e.target.value })} />
                  </div>
                  <Button size="sm" disabled={!amountMap[v.id] || !reasonMap[v.id] || adjustMut.isPending} onClick={() => {
                    const delta = Number(amountMap[v.id]);
                    if (!Number.isFinite(delta) || delta === 0) return toast.error("Enter a non-zero amount");
                    adjustMut.mutate({ id: v.id, delta, reason: reasonMap[v.id] });
                    setAmountMap({ ...amountMap, [v.id]: "" });
                  }}>Apply</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubmissionsTab() {
  const listFn = useServerFn(adminListTfns);
  const updateFn = useServerFn(adminUpdateTfnStatus);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin","tfns","pending"], queryFn: () => listFn({ data: { status: "pending_verification" } }) });
  const [reasonMap, setReasonMap] = useState<Record<string,string>>({});

  const setStatus = useMutation({
    mutationFn: (args: { id: string; status: "verified" | "rejected"; reason?: string }) =>
      updateFn({ data: { tfn_id: args.id, status: args.status, rejection_reason: args.reason } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin","tfns","pending"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Pending submissions</CardTitle></CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Nothing pending.</div> : (
          <div className="space-y-2">
            {(data ?? []).map((t: any) => (
              <div key={t.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono">{t.phone_number}</div>
                    <div className="text-xs text-muted-foreground">{t.verifiers?.full_name} · {t.verifiers?.email}</div>
                    {t.notes && <div className="text-xs mt-1">Notes: {t.notes}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={()=>setStatus.mutate({ id: t.id, status: "verified" })}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={()=>setStatus.mutate({ id: t.id, status: "rejected", reason: reasonMap[t.id] || "Did not meet requirements" })}>Reject</Button>
                  </div>
                </div>
                <Input placeholder="Rejection reason (optional)" value={reasonMap[t.id] || ""} onChange={e=>setReasonMap({ ...reasonMap, [t.id]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PoolTab() {
  const listFn = useServerFn(adminListTfns);
  const assignFn = useServerFn(adminAssignTfnToAccount);
  const accountsFn = useServerFn(adminListAccountsLite);
  const qc = useQueryClient();
  const { data: tfns } = useQuery({ queryKey: ["admin","tfns","verified"], queryFn: () => listFn({ data: { status: "verified" } }) });
  const { data: accounts } = useQuery({ queryKey: ["admin","accounts","lite"], queryFn: () => accountsFn() });
  const [assignMap, setAssignMap] = useState<Record<string,string>>({});

  const deleteFn = useServerFn(adminDeleteVerifierTfn);
  const assign = useMutation({
    mutationFn: (args: { tfn: string; account: string }) => assignFn({ data: { tfn_id: args.tfn, account_id: args.account } }),
    onSuccess: () => { toast.success("Number assigned"); qc.invalidateQueries({ queryKey: ["admin","tfns","verified"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tfn_id: id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["admin","tfns","verified"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Verified pool ({(tfns ?? []).length})</CardTitle></CardHeader>
      <CardContent>
        {(tfns ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Pool empty.</div> : (
          <div className="space-y-2">
            {(tfns ?? []).map((t: any) => (
              <div key={t.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono">{t.phone_number}</div>
                  <div className="text-xs text-muted-foreground">by {t.verifiers?.full_name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={assignMap[t.id] || ""} onValueChange={v => setAssignMap({ ...assignMap, [t.id]: v })}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Assign to tenant…"/></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(accounts ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!assignMap[t.id]} onClick={()=>assign.mutate({ tfn: t.id, account: assignMap[t.id] })}>Assign</Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Remove ${t.phone_number} from pool?`)) del.mutate(t.id); }}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WithdrawalsTab() {
  const listFn = useServerFn(adminListWithdrawals);
  const payFn = useServerFn(adminMarkWithdrawalPaid);
  const rejectFn = useServerFn(adminRejectWithdrawal);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin","withdrawals"], queryFn: () => listFn() });
  const [noteMap, setNoteMap] = useState<Record<string,string>>({});

  const pay = useMutation({
    mutationFn: (id: string) => payFn({ data: { withdrawal_id: id, admin_note: noteMap[id] } }),
    onSuccess: () => { toast.success("Marked paid"); qc.invalidateQueries({ queryKey: ["admin","withdrawals"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { withdrawal_id: id, admin_note: noteMap[id] || "Rejected" } }),
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["admin","withdrawals"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Withdrawal requests</CardTitle></CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No withdrawals.</div> : (
          <div className="space-y-3">
            {(data ?? []).map((w: any) => (
              <div key={w.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">₦{Number(w.amount_ngn).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{w.verifiers?.full_name} · {w.verifiers?.email}</div>
                    {w.bank && <div className="text-xs mt-1">→ {w.bank.bank_name} · {w.bank.account_number} · {w.bank.account_name}</div>}
                    <div className="text-xs text-muted-foreground mt-1">Requested {new Date(w.requested_at).toLocaleString()}</div>
                  </div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "outline"}>{w.status}</Badge>
                </div>
                {w.status === "pending" && (
                  <div className="space-y-2">
                    <Textarea placeholder="Admin note (optional)" value={noteMap[w.id] || ""} onChange={e=>setNoteMap({ ...noteMap, [w.id]: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={()=>pay.mutate(w.id)}>Mark paid</Button>
                      <Button size="sm" variant="destructive" onClick={()=>reject.mutate(w.id)}>Reject</Button>
                    </div>
                  </div>
                )}
                {w.admin_note && w.status !== "pending" && <div className="text-xs">Note: {w.admin_note}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const getFn = useServerFn(adminGetTfnSettings);
  const setFn = useServerFn(adminSetTfnSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin","tfn-settings"], queryFn: () => getFn() });
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [ngnRate, setNgnRate] = useState("");
  useEffect(() => {
    if (data) {
      setPrice(String(data.price_usd));
      setCommission(String(data.commission_pct));
      setNgnRate(String(data.ngn_per_usd));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => setFn({ data: { price_usd: Number(price), commission_pct: Number(commission), ngn_per_usd: Number(ngnRate) } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin","tfn-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Marketplace settings</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div><Label>Buyer price (USD)</Label><Input type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} /></div>
        <div><Label>Platform commission (%)</Label><Input type="number" value={commission} onChange={e=>setCommission(e.target.value)} /></div>
        <div>
          <Label>NGN per USD (verifier payout rate)</Label>
          <Input type="number" value={ngnRate} onChange={e=>setNgnRate(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Verifiers are paid in NGN; buyer's USD price is converted at this rate.</p>
        </div>
        <Button onClick={()=>save.mutate()} disabled={save.isPending}>Save settings</Button>
      </CardContent>
    </Card>
  );
}

