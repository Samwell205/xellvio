import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Plus, Trash2, ExternalLink } from "lucide-react";
import { formatMoney, formatUSD } from "@/lib/money";
import { adminListPacks, upsertCreditPack, deleteCreditPack, updateBillingSettings, adminListPayments, approvePayment, rejectPayment, signedProofUrl, adminListTenantBilling, adminGetTenantBilling } from "@/lib/billing-admin.functions";
import { getBillingSettings } from "@/lib/billing-packs.functions";
import { simulateNowPaymentsIpn } from "@/lib/nowpayments-admin.functions";
import { BalanceCard } from "@/components/BalanceCard";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  head: () => ({ meta: [{ title: "Admin · Billing — Xellvio" }] }),
  component: AdminBillingPage,
});

function AdminBillingPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Wallet className="size-6" /> Billing administration</h1>
        <p className="text-sm text-muted-foreground">Manage credit packs, Payoneer instructions, and pending payments.</p>
      </div>
      <BalanceCard />
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Pending payments</TabsTrigger>
          <TabsTrigger value="packs">Credit packs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4"><PendingPayments /></TabsContent>
        <TabsContent value="packs" className="mt-4"><PacksAdmin /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsAdmin /></TabsContent>
        <TabsContent value="diagnostics" className="mt-4"><Diagnostics /></TabsContent>
      </Tabs>
    </div>
  );
}

function Diagnostics() {
  const simFn = useServerFn(simulateNowPaymentsIpn);
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("finished");
  const [result, setResult] = useState<any>(null);
  const sim = useMutation({
    mutationFn: async () => simFn({ data: { reference, status } }),
    onSuccess: (r) => { setResult(r); toast.success(`IPN ${r.status} — payment ${r.before} → ${r.after}`); },
    onError: (e: Error) => { setResult({ error: e.message }); toast.error(e.message); },
  });
  return (
    <Card className="p-4 space-y-4 max-w-2xl">
      <div>
        <h3 className="font-semibold">Simulate NOWPayments IPN</h3>
        <p className="text-xs text-muted-foreground">Signs a fake callback server-side and posts it to the IPN endpoint. Use the <code>provider_reference</code> from a pending NOWPayments payment (looks like <code>npm_xxxx</code>).</p>
      </div>
      <div><Label>Payment reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="npm_..." /></div>
      <div>
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="finished">finished (credit)</SelectItem>
            <SelectItem value="confirmed">confirmed (credit)</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="expired">expired</SelectItem>
            <SelectItem value="refunded">refunded</SelectItem>
            <SelectItem value="waiting">waiting</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => sim.mutate()} disabled={sim.isPending || !reference}>Send simulated IPN</Button>
      {result && <pre className="text-xs bg-muted/40 p-3 rounded overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>}
    </Card>
  );
}

function PendingPayments() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPayments);
  const approveFn = useServerFn(approvePayment);
  const rejectFn = useServerFn(rejectPayment);
  const signFn = useServerFn(signedProofUrl);

  const [filter, setFilter] = useState<"pending" | "paid" | "all">("pending");
  const list = useQuery({
    queryKey: ["admin-payments", filter],
    queryFn: () => listFn(filter === "all" ? { data: {} as any } : { data: { status: filter } as any }),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Approved — credits added"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: async (id: string) => rejectFn({ data: { id } }),
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openProof(path: string) {
    try {
      const r = await signFn({ data: { path } });
      window.open(r.url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex gap-2">
        {(["pending","paid","all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
        ))}
      </div>
      {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Tenant</th>
                <th className="text-left p-3">Provider</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Credits</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Proof</th>
                <th className="text-left p-3">Note</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t align-top">
                  <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="font-medium">{p.accounts?.legal_business_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.accounts?.contact_email ?? p.accounts?.email}</div>
                  </td>
                  <td className="p-3 capitalize">{p.provider}</td>
                  <td className="p-3 tabular-nums">{formatMoney(Number(p.amount), p.currency)}</td>
                  <td className="p-3 tabular-nums">{formatUSD(Number(p.credits))}</td>
                  <td className="p-3 capitalize">{p.status}</td>
                  <td className="p-3">
                    {p.proof_url ? (
                      <Button size="sm" variant="outline" onClick={() => openProof(p.proof_url)}>
                        <ExternalLink className="size-3 mr-1" />View
                      </Button>
                    ) : "—"}
                  </td>
                  <td className="p-3 text-xs max-w-[220px]">{p.customer_note ?? "—"}</td>
                  <td className="p-3 text-right">
                    {p.status === "pending" ? (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => reject.mutate(p.id)} disabled={reject.isPending}>Reject</Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">{p.admin_note ?? ""}</span>}
                  </td>
                </tr>
              ))}
              {(list.data ?? []).length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">Nothing here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PacksAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPacks);
  const upsertFn = useServerFn(upsertCreditPack);
  const delFn = useServerFn(deleteCreditPack);
  const list = useQuery({ queryKey: ["admin-packs"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  function startNew() { setEditing({ name: "", currency: "NGN", price: 5000, credits: 10, display_order: 0, is_active: true, is_popular: false, description: "" }); setOpen(true); }
  function startEdit(p: any) { setEditing({ ...p }); setOpen(true); }

  const save = useMutation({
    mutationFn: async () => upsertFn({ data: editing }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-packs"] }); qc.invalidateQueries({ queryKey: ["credit-packs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-packs"] }); qc.invalidateQueries({ queryKey: ["credit-packs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex justify-end">
        <Button onClick={startNew}><Plus className="size-4 mr-1" />New pack</Button>
      </div>
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr><th className="text-left p-3">Order</th><th className="text-left p-3">Name</th><th className="text-left p-3">Currency</th><th className="text-left p-3">Price</th><th className="text-left p-3">Credits (USD)</th><th className="text-left p-3">Active</th><th className="text-left p-3">Popular</th><th className="text-right p-3">Actions</th></tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.display_order}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.currency}</td>
                <td className="p-3 tabular-nums">{formatMoney(Number(p.price), p.currency)}</td>
                <td className="p-3 tabular-nums">{formatUSD(Number(p.credits))}</td>
                <td className="p-3">{p.is_active ? "Yes" : "No"}</td>
                <td className="p-3">{p.is_popular ? "★" : ""}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" className="mr-2" onClick={() => startEdit(p)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this pack?")) remove.mutate(p.id); }}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit pack" : "New pack"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Description</Label><Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Currency</Label>
                  <Select value={editing.currency} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NGN">NGN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Price</Label><Input type="number" min={0} step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
                <div><Label>Credits (USD)</Label><Input type="number" min={0} step="0.01" value={editing.credits} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div><Label>Display order</Label><Input type="number" value={editing.display_order} onChange={(e) => setEditing({ ...editing, display_order: Number(e.target.value) })} /></div>
                <div className="flex items-center gap-2"><Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label>Active</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editing.is_popular} onCheckedChange={(v) => setEditing({ ...editing, is_popular: v })} /><Label>Popular</Label></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SettingsAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(getBillingSettings);
  const saveFn = useServerFn(updateBillingSettings);
  const data = useQuery({ queryKey: ["billing-settings-admin"], queryFn: () => getFn() });
  const [form, setForm] = useState<any | null>(null);
  if (data.data && !form) setForm({ ...data.data });

  const save = useMutation({
    mutationFn: async () => saveFn({ data: form }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["billing-settings"] }); qc.invalidateQueries({ queryKey: ["billing-settings-admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <Card className="p-4">Loading…</Card>;
  return (
    <Card className="p-4 space-y-4 max-w-2xl">
      <div>
        <Label>Default currency shown to customers</Label>
        <Select value={form.default_currency} onValueChange={(v) => setForm({ ...form, default_currency: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="NGN">NGN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
        </Select>
      </div>
      <div><Label>Payoneer payee email</Label><Input value={form.payoneer_payee_email ?? ""} onChange={(e) => setForm({ ...form, payoneer_payee_email: e.target.value })} placeholder="billing@yourcompany.com" /></div>
      <div><Label>Payoneer payee name</Label><Input value={form.payoneer_payee_name ?? ""} onChange={(e) => setForm({ ...form, payoneer_payee_name: e.target.value })} placeholder="Your Company Ltd" /></div>
      <div><Label>Instructions for customers</Label><Textarea rows={4} value={form.payoneer_instructions ?? ""} onChange={(e) => setForm({ ...form, payoneer_instructions: e.target.value })} placeholder="e.g. Include your account email in the payment note. Credits added within 1 business day." /></div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>Save settings</Button>
    </Card>
  );
}
