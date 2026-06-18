import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { reviewSenderId } from "@/lib/numbers.functions";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({ meta: [{ title: "Admin — Samwell Global SMS" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/app" });
  },
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const review = useServerFn(reviewSenderId);
  const q = useQuery({
    queryKey: ["admin-sender-ids"],
    queryFn: async () => (await supabase.from("sender_ids").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const mut = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) => review({ data: { id: v.id, decision: v.decision, note: notes[v.id] } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-sender-ids"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Admin · Sender ID review</h1>
        <p className="text-sm text-muted-foreground">Approve or reject Sender ID requests from users.</p>
      </div>
      {q.isLoading && <Card className="p-6">Loading…</Card>}
      {q.data?.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No requests.</Card>}
      <div className="space-y-3">
        {q.data?.map((s: any) => (
          <Card key={s.id} className="p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-lg font-bold">{s.sender_id}</div>
                <div className="text-xs text-muted-foreground">
                  {s.user_id} · {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>{s.status}</Badge>
            </div>
            <div className="text-sm"><strong>Countries:</strong> {s.countries?.length ? s.countries.join(", ") : "All"}</div>
            {s.use_case && <div className="text-sm"><strong>Use case:</strong> {s.use_case}</div>}
            {s.status === "pending" && (
              <>
                <Textarea rows={2} placeholder="Optional note shown to the user"
                  value={notes[s.id] ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => mut.mutate({ id: s.id, decision: "approved" })}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => mut.mutate({ id: s.id, decision: "rejected" })}>Reject</Button>
                </div>
              </>
            )}
            {s.review_note && <div className="text-xs italic text-muted-foreground">Note: {s.review_note}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}
