import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, Plus } from "lucide-react";
import { listMyNumberRequests, cancelMyNumberRequest } from "@/lib/number-requests.functions";

export const Route = createFileRoute("/_authenticated/app/number-requests")({
  head: () => ({ meta: [{ title: "My number requests — SAMWELL SMS HUB" }] }),
  component: MyNumberRequestsPage,
});

function MyNumberRequestsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyNumberRequests);
  const cancelFn = useServerFn(cancelMyNumberRequest);

  const list = useQuery({ queryKey: ["my-number-requests"], queryFn: () => listFn() });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-number-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <PhoneCall className="size-6" /> My US/Canada number requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Track the status of phone numbers you've requested for sending SMS to the US and Canada.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/app/setup-sms"><Plus className="size-4 mr-1" /> New request</Link>
        </Button>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!list.isLoading && items.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          You haven't requested a number yet. Go to{" "}
          <Link to="/app/setup-sms" className="text-primary underline">Set up SMS</Link> and pick US or Canada to submit a request.
        </Card>
      )}

      <div className="space-y-3">
        {items.map((r: any) => {
          const variant =
            r.status === "approved" || r.status === "provisioned" ? "default" :
            r.status === "rejected" ? "destructive" : "secondary";
          return (
            <Card key={r.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {r.business_name} <span className="text-muted-foreground font-normal">· {r.country} · {r.number_type.replace("_", " ")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Submitted {new Date(r.created_at).toLocaleString()} · ~{r.expected_monthly_volume.toLocaleString()} msgs/mo
                  </div>
                </div>
                <Badge variant={variant as any}>{r.status}</Badge>
              </div>

              {r.assigned_phone_number && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground">Assigned phone number</div>
                  <div className="font-mono font-semibold">{r.assigned_phone_number}</div>
                </div>
              )}

              {r.admin_notes && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Notes from our team</div>
                  <div className="whitespace-pre-wrap">{r.admin_notes}</div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Use case</div>
                  <div className="rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{r.use_case}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Sample message</div>
                  <div className="rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{r.sample_message}</div>
                </div>
              </div>

              {r.status === "pending" && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                    Cancel request
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
