import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { adminListApiAccessRequests, adminReviewApiAccessRequest } from "@/lib/api-access-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/api-access")({
  head: () => ({ meta: [{ title: "Admin · API access requests — Xellvio" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-api-access"], queryFn: useServerFn(adminListApiAccessRequests) });
  const reviewFn = useServerFn(adminReviewApiAccessRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const review = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "revoked" }) => reviewFn({ data: { ...v, note: notes[v.id] } }),
    onSuccess: () => { toast.success("Updated"); void qc.invalidateQueries({ queryKey: ["admin-api-access"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = list.data ?? [];
  return <div className="space-y-6 p-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><KeyRound className="size-5" /> API access requests</h1><p className="text-sm text-muted-foreground">Tenants can only see and use the API after you approve their request.</p></div>
    {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    {!list.isLoading && !rows.length && <Card className="p-6 text-sm text-muted-foreground">No requests yet.</Card>}
    {rows.map((r) => <Card key={r.id} className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.company_name}</span><Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "outline" : "secondary"}>{r.status}</Badge><span className="text-xs text-muted-foreground">{r.account_email ?? r.account_id}</span><span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></div>
      {r.website && <p className="text-sm"><span className="text-muted-foreground">Website:</span> {r.website}</p>}
      <p className="text-sm"><span className="text-muted-foreground">Use case:</span> {r.use_case}</p>
      <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {r.reason}</p>
      {r.expected_monthly_volume != null && <p className="text-sm"><span className="text-muted-foreground">Expected volume:</span> {r.expected_monthly_volume.toLocaleString()} / month</p>}
      {r.admin_note && r.status !== "pending" && <p className="text-sm"><span className="text-muted-foreground">Note:</span> {r.admin_note}</p>}
      {(r.status === "pending" || r.status === "approved") && <>
        <Textarea placeholder="Note to tenant (shown if rejected or revoked)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} maxLength={1000} />
        <div className="flex gap-2">{r.status === "pending" ? <><Button disabled={review.isPending} onClick={() => review.mutate({ id: r.id, status: "approved" })}>Approve</Button><Button variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, status: "rejected" })}>Reject</Button></> : <Button variant="destructive" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, status: "revoked" })}>Revoke access</Button>}</div>
      </>}
    </Card>)}
  </div>;
}
