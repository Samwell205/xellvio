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
import { Badge } from "@/components/ui/badge";
import { PhoneCall } from "lucide-react";
import { adminListNumberRequests, adminReviewNumberRequest } from "@/lib/number-requests.functions";

export const Route = createFileRoute("/_authenticated/admin/number-requests")({
  head: () => ({ meta: [{ title: "Admin · Number requests — SAMWELL SMS HUB" }] }),
  component: AdminNumberRequestsPage,
});

function AdminNumberRequestsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListNumberRequests);
  const reviewFn = useServerFn(adminReviewNumberRequest);

  const list = useQuery({ queryKey: ["admin-number-requests"], queryFn: () => listFn() });

  const review = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" | "provisioned"; admin_notes?: string; assigned_phone_number?: string }) =>
      reviewFn({ data: vars }),
    onSuccess: () => {
      toast.success("Request updated");
      qc.invalidateQueries({ queryKey: ["admin-number-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><PhoneCall className="size-6" /> US/Canada number requests</h1>
        <p className="text-sm text-muted-foreground">Review customer requests for toll-free, 10DLC, and short code numbers.</p>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!list.isLoading && items.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">No requests yet.</Card>
      )}

      <div className="space-y-4">
        {items.map((r: any) => (
          <RequestRow key={r.id} req={r} onReview={(vars) => review.mutate(vars)} busy={review.isPending} />
        ))}
      </div>
    </div>
  );
}

function RequestRow({ req, onReview, busy }: { req: any; onReview: (v: any) => void; busy: boolean }) {
  const [notes, setNotes] = useState(req.admin_notes ?? "");
  const [phone, setPhone] = useState(req.assigned_phone_number ?? "");

  const statusVariant =
    req.status === "approved" || req.status === "provisioned" ? "default" :
    req.status === "rejected" ? "destructive" : "secondary";

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{req.business_name} <span className="text-muted-foreground font-normal">· {req.country}</span></div>
          <div className="text-xs text-muted-foreground">
            {req.accounts?.contact_email ?? req.accounts?.email} · {req.number_type.replace("_", " ")} · ~{req.expected_monthly_volume.toLocaleString()} msgs/mo
          </div>
          {req.business_website && (
            <a href={req.business_website} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{req.business_website}</a>
          )}
        </div>
        <Badge variant={statusVariant as any}>{req.status}</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Use case</div>
          <div className="rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{req.use_case}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Sample message</div>
          <div className="rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{req.sample_message}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Assigned phone number (E.164)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+18885551234" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Admin notes (sent to user)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onReview({ id: req.id, status: "rejected", admin_notes: notes })}>
          Reject
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onReview({ id: req.id, status: "approved", admin_notes: notes, assigned_phone_number: phone || undefined })}>
          Approve
        </Button>
        <Button size="sm" variant="default" disabled={busy || !phone} onClick={() => onReview({ id: req.id, status: "provisioned", admin_notes: notes, assigned_phone_number: phone })}>
          Mark provisioned
        </Button>
      </div>
    </Card>
  );
}
