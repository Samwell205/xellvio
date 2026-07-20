import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, Check, Trash2, Radio, Gift, Users, Plus, Unlink } from "lucide-react";
import {
  listAllSenders, adminRefreshSender, adminMarkSenderVerified, adminDeleteSender, adminGrantVerifiedTollfree,
  adminListSharedTollfree, adminCreateSharedTollfree, adminAttachSharedTollfree,
  adminDetachSharedTollfree, adminDeleteSharedTollfree,
} from "@/lib/admin-senders.functions";

import { adminListAccountsLite } from "@/lib/admin-verifiers.functions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/senders")({
  component: AdminSendersPage,
});

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  submitted: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
  in_review: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
  pending: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40",
  rejected: "bg-destructive/20 text-destructive border-destructive/40",
  requires_registration: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
};

function AdminSendersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllSenders);
  const refreshFn = useServerFn(adminRefreshSender);
  const markFn = useServerFn(adminMarkSenderVerified);
  const deleteFn = useServerFn(adminDeleteSender);
  const grantFn = useServerFn(adminGrantVerifiedTollfree);
  const listAccountsFn = useServerFn(adminListAccountsLite);

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantAccountId, setGrantAccountId] = useState("");
  const [grantPhone, setGrantPhone] = useState("");
  const [grantCountry, setGrantCountry] = useState("US");
  const [accountSearch, setAccountSearch] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["admin-accounts-lite"],
    queryFn: () => listAccountsFn(),
    enabled: grantOpen,
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-senders"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  const refreshMut = useMutation({
    mutationFn: (senderId: string) => refreshFn({ data: { senderId } }),
    onSuccess: (r: any) => { toast.success(`Refreshed: ${r.status ?? "n/a"}`); qc.invalidateQueries({ queryKey: ["admin-senders"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const markMut = useMutation({
    mutationFn: (senderId: string) => markFn({ data: { senderId } }),
    onSuccess: () => { toast.success("Marked verified"); qc.invalidateQueries({ queryKey: ["admin-senders"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (senderId: string) => deleteFn({ data: { senderId } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-senders"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const grantMut = useMutation({
    mutationFn: () => grantFn({ data: {
      account_id: grantAccountId,
      country: grantCountry,
      phone_number: grantPhone.trim() || undefined,
    } }),
    onSuccess: (r: any) => {
      toast.success(`Granted ${r.phone_number} — tenant can send immediately.`);
      qc.invalidateQueries({ queryKey: ["admin-senders"] });
      setGrantOpen(false); setGrantAccountId(""); setGrantPhone(""); setGrantCountry("US");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    const list = (accounts ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
    if (!q) return list.slice(0, 50);
    return list.filter(a =>
      (a.email ?? "").toLowerCase().includes(q) ||
      (a.full_name ?? "").toLowerCase().includes(q),
    ).slice(0, 50);
  }, [accounts, accountSearch]);

  const rows = useMemo(() => {
    const all = (data ?? []) as any[];
    return all.filter((r) => {
      if (statusFilter !== "all" && r.verification_status !== statusFilter) return false;
      if (kindFilter !== "all" && r.sender_kind !== kindFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.tenant_email ?? "").toLowerCase().includes(q) ||
          (r.phone_number ?? "").toLowerCase().includes(q) ||
          (r.country_code ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, statusFilter, kindFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Radio className="size-5 text-primary" /> Tenant senders</h1>
          <p className="text-sm text-muted-foreground">Every sender ID, toll-free, and local number across all tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <Gift className="size-4 mr-1" /> Grant verified toll-free
          </Button>
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-senders"] })}>
            <RefreshCw className="size-4 mr-1" /> Reload
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input placeholder="Search tenant, number, country…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="requires_registration">Requires registration</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="toll_free">Toll-free</SelectItem>
              <SelectItem value="sender_id">Alphanumeric sender ID</SelectItem>
              <SelectItem value="local">Local number</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Tenant</th>
                <th className="text-left p-2">Country</th>
                <th className="text-left p-2">Kind</th>
                <th className="text-left p-2">Sender</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Submitted</th>
                <th className="text-left p-2">Reason</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground"><Loader2 className="size-4 mr-2 inline animate-spin" /> Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No senders match.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">
                    <div className="font-medium text-xs">{r.tenant_business || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.tenant_email ?? "—"}</div>
                  </td>
                  <td className="p-2 font-mono text-xs">{r.country_code}</td>
                  <td className="p-2 text-xs">{r.sender_kind}</td>
                  <td className="p-2 font-mono text-xs">{r.phone_number ?? "—"}</td>
                  <td className="p-2">
                    <Badge variant="outline" className={STATUS_COLORS[r.verification_status] ?? ""}>
                      {r.verification_status}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-2 text-xs max-w-xs truncate" title={r.rejection_reason ?? ""}>
                    {r.friendly_rejection_reason ?? r.rejection_reason ?? "—"}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {r.sender_kind === "toll_free" && r.telnyx_verification_id && (
                      <Button size="sm" variant="ghost" onClick={() => refreshMut.mutate(r.id)} disabled={refreshMut.isPending}>
                        <RefreshCw className="size-3" />
                      </Button>
                    )}
                    {r.verification_status !== "verified" && (
                      <Button size="sm" variant="ghost" onClick={() => markMut.mutate(r.id)} disabled={markMut.isPending} title="Mark verified (admin override)">
                        <Check className="size-3 text-emerald-600" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this sender?")) deleteMut.mutate(r.id); }} disabled={deleteMut.isPending}>
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant verified toll-free number</DialogTitle>
            <DialogDescription>
              Give a tenant a ready-to-send toll-free number. The number is marked verified and the tenant can start sending SMS to the US immediately — no carrier verification required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Country</Label>
              <Select value={grantCountry} onValueChange={setGrantCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="PR">Puerto Rico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tenant</Label>
              <Input placeholder="Search by email or name…" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} />
              <div className="max-h-40 overflow-y-auto border rounded-md divide-y mt-1">
                {filteredAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setGrantAccountId(a.id)}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted ${grantAccountId === a.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium">{a.email ?? "—"}</div>
                    <div className="text-muted-foreground">{a.full_name ?? ""} · {a.id.slice(0, 8)}</div>
                  </button>
                ))}
                {filteredAccounts.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">No tenants match.</div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Phone number (optional)</Label>
              <Input placeholder="+18005550123 — leave empty to buy a new one on Telnyx" value={grantPhone} onChange={(e) => setGrantPhone(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave blank to search Telnyx and provision a new toll-free number automatically.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button
              onClick={() => grantMut.mutate()}
              disabled={!grantAccountId || grantMut.isPending}
            >
              {grantMut.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
              Grant access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
