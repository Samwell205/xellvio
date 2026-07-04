import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListReviewQueue,
  adminResolveReview,
} from "@/lib/compliance-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/review-queue")({
  head: () => ({ meta: [{ title: "Review queue — Admin" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
    if (error || data !== true) throw redirect({ to: "/app" });
  },
  component: ReviewQueuePage,
});

function ReviewQueuePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const listFn = useServerFn(adminListReviewQueue);
  const listQ = useQuery({
    queryKey: ["review-queue", tab],
    queryFn: () => listFn({ data: { status: tab } }),
    refetchInterval: 15_000,
  });

  const resolveFn = useServerFn(adminResolveReview);
  const resolve = useMutation({
    mutationFn: (v: { reviewId: string; action: "approve" | "reject"; note?: string }) =>
      resolveFn({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      toast.success(v.action === "approve" ? "Approved — send resumed" : "Rejected — campaign blocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Compliance review queue</h1>
        <p className="text-sm text-muted-foreground">
          Flagged messages holding for admin approval. Pending items auto-approve after 2h if untouched.
        </p>
      </div>
      <div className="flex gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nothing here.</Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r: any) => {
            const isPending = r.status === "pending";
            const reasons = Array.isArray(r.blocked_reasons) ? r.blocked_reasons : [];
            return (
              <Card key={r.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.tenant_label}</span>
                      <Badge variant={r.risk_score >= 70 ? "destructive" : "secondary"}>
                        Risk {r.risk_score}/100
                      </Badge>
                      <Badge variant="outline">
                        {r.status === "pending" ? (
                          <><Clock className="size-3 mr-1" />Pending</>
                        ) : r.status === "approved" || r.status === "auto_approved" ? (
                          <><CheckCircle2 className="size-3 mr-1" />{r.status}</>
                        ) : (
                          <><XCircle className="size-3 mr-1" />{r.status}</>
                        )}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                      {isPending && (
                        <> · auto-approves {new Date(r.auto_approve_at).toLocaleString()}</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{r.message_text}</div>
                {reasons.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                    {reasons.map((x: any, i: number) => (
                      <li key={i}><span className="font-mono">{x.code}</span> — {x.message}</li>
                    ))}
                  </ul>
                )}
                {isPending ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Optional note (visible in audit)"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      className="text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve.mutate({ reviewId: r.id, action: "reject", note: notes[r.id] })}
                        disabled={resolve.isPending}
                      >
                        <XCircle className="size-4 mr-1.5" />Reject & block campaign
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resolve.mutate({ reviewId: r.id, action: "approve", note: notes[r.id] })}
                        disabled={resolve.isPending}
                      >
                        <CheckCircle2 className="size-4 mr-1.5" />Approve & resume send
                      </Button>
                    </div>
                  </div>
                ) : r.reviewer_note ? (
                  <div className="text-xs text-muted-foreground italic">Note: {r.reviewer_note}</div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
