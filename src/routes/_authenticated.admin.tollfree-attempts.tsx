import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2 } from "lucide-react";
import { adminListTollfreeAttempts } from "@/lib/admin-overview.functions";

export const Route = createFileRoute("/_authenticated/admin/tollfree-attempts")({
  head: () => ({ meta: [{ title: "Toll-free logs — Admin" }] }),
  component: AdminTollfreeAttemptsPage,
});

function AdminTollfreeAttemptsPage() {
  const listAttempts = useServerFn(adminListTollfreeAttempts);
  const q = useQuery({ queryKey: ["admin", "tollfree-attempts"], queryFn: () => listAttempts() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <ClipboardList className="size-6" /> Toll-free verification logs
        </h1>
        <p className="text-sm text-muted-foreground">Most recent 200 toll-free submission attempts across all tenants.</p>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1200px]">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tenant / Actor</th>
                  <th className="p-3">Number</th>
                  <th className="p-3">Verification SID</th>
                  <th className="p-3">Twilio</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((attempt: any) => (
                  <tr key={attempt.id} className="border-t align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(attempt.created_at).toLocaleString()}</td>
                    <td className="p-3"><AttemptBadge status={attempt.attempt_status} /></td>
                    <td className="p-3">
                      <div className="font-medium">{attempt.account_label}</div>
                      <div className="text-xs text-muted-foreground">{attempt.actor_label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{attempt.account_id}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <div>{attempt.phone_number ?? "—"}</div>
                      <div className="text-muted-foreground">{attempt.phone_sid ?? ""}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{attempt.verification_sid ?? "—"}</td>
                    <td className="p-3 text-xs">
                      <div>{attempt.twilio_status ? `HTTP ${attempt.twilio_status}` : "—"}</div>
                      {attempt.twilio_code && <div className="text-muted-foreground">Code {attempt.twilio_code}</div>}
                      {attempt.twilio_more_info && <div className="text-muted-foreground max-w-56 truncate">{attempt.twilio_more_info}</div>}
                    </td>
                    <td className="p-3 max-w-md">
                      {(attempt.friendly_failure_reason || attempt.failure_reason) && (
                        <div className="mb-2 text-destructive font-medium">{attempt.friendly_failure_reason ?? attempt.failure_reason}</div>
                      )}
                      <pre className="text-xs whitespace-pre-wrap text-muted-foreground max-h-44 overflow-auto">
                        {JSON.stringify({ request: attempt.request_summary, response: attempt.twilio_response }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
                {(q.data ?? []).length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No toll-free verification attempts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function AttemptBadge({ status }: { status: string }) {
  const destructive = status === "failed" || status === "no_verification_sid";
  const success = status === "submitted" || status === "already_submitted";
  return (
    <Badge variant={destructive ? "destructive" : success ? "default" : "outline"} className="whitespace-nowrap">
      {status.replaceAll("_", " ")}
    </Badge>
  );
}