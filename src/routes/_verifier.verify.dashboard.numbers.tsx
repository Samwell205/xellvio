import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyTfns, submitTfn, claimTfnFromPool, submitAssignedTfn, refreshMyTfn } from "@/lib/verifier.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TollfreeWizard, type WizardForm } from "@/components/tollfree-wizard/TollfreeWizard";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_verifier/verify/dashboard/numbers")({
  component: NumbersPage,
});

function NumbersPage() {
  const list = useServerFn(listMyTfns);
  const submit = useServerFn(submitTfn);
  const claim = useServerFn(claimTfnFromPool);
  const submitAssigned = useServerFn(submitAssignedTfn);
  const refresh = useServerFn(refreshMyTfn);
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["verifier", "tfns"],
    queryFn: () => list(),
    refetchInterval: (q) => {
      const list = (q.state.data as any[]) ?? [];
      const pending = list.some((r) => r.status === "pending_verification");
      return pending ? 20_000 : false;
    },
  });
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [wizardTfnId, setWizardTfnId] = useState<string | null>(null);

  // Realtime: any row change for this verifier's TFNs invalidates the list.
  useEffect(() => {
    const channel = supabase
      .channel("verifier-tfns-changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "verifier_tfns" },
        () => qc.invalidateQueries({ queryKey: ["verifier", "tfns"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Poll Twilio directly for any pending rows so status reflects carrier state.
  useEffect(() => {
    const pendingIds = (rows ?? []).filter((r: any) => r.status === "pending_verification").map((r: any) => r.id);
    if (pendingIds.length === 0) return;
    const timer = setInterval(() => {
      pendingIds.forEach((id) => refresh({ data: { id } }).catch(() => {}));
    }, 60_000);
    return () => clearInterval(timer);
  }, [rows, refresh]);

  const claimMut = useMutation({
    mutationFn: () => claim(),
    onSuccess: (r: any) => {
      toast.success(`Assigned ${r.phone_number} — fill in the verification details below`);
      qc.invalidateQueries({ queryKey: ["verifier", "tfns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submitMut = useMutation({
    mutationFn: () => submit({ data: { phone_number: phone, country: "US", notes } }),
    onSuccess: () => {
      toast.success("Number submitted for verification");
      setPhone(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["verifier", "tfns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submitAssignedMut = useMutation({
    mutationFn: (v: { id: string; payload: WizardForm }) =>
      submitAssigned({ data: { id: v.id, notes: JSON.stringify(v.payload), payload: v.payload } }),
    onSuccess: (r: any) => {
      toast.success(
        r?.status === "verified" ? "Approved by the carrier." :
        r?.status === "rejected" ? "Carrier rejected the submission." :
        "Submitted to the carrier — status will update automatically.",
      );
      qc.invalidateQueries({ queryKey: ["verifier", "tfns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refresh({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verifier", "tfns"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My numbers</h1>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Claim a number to verify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">
            One click assigns you a toll-free number to verify. We first check the platform pool for
            an unclaimed number, and if none is available we buy a fresh toll-free from Twilio and
            assign it to you automatically.
          </p>
          <Button disabled={claimMut.isPending} onClick={() => claimMut.mutate()}>
            {claimMut.isPending ? "Assigning a number…" : "Claim a number"}
          </Button>
          <div>
            <button type="button" className="text-xs text-slate-400 hover:text-slate-200 underline" onClick={() => setShowManual((s) => !s)}>
              {showManual ? "Hide manual entry" : "I already have a number to submit"}
            </button>
          </div>
        </CardContent>
      </Card>

      {showManual && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle>Submit an existing toll-free number</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Phone number (E.164)</Label><Input placeholder="+18885551234" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context our team should know" /></div>
            <Button disabled={submitMut.isPending || !phone} onClick={() => submitMut.mutate()}>Submit for verification</Button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>Submitted numbers</CardTitle></CardHeader>
        <CardContent>
          {(rows ?? []).length === 0 ? (
            <div className="text-sm text-slate-400">No numbers submitted yet.</div>
          ) : (
            <div className="space-y-3">
              {(rows ?? []).map((r: any) => (
                <div key={r.id} className="border border-slate-800 rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono">{r.phone_number}</div>
                      <div className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</div>
                      {r.rejection_reason && <div className="text-xs text-red-400 mt-1">Reason: {r.rejection_reason}</div>}
                    </div>
                    <div className="text-right">
                      <Badge variant={
                        r.status === "verified" ? "default" :
                        r.status === "sold" ? "secondary" :
                        r.status === "rejected" ? "destructive" : "outline"
                      }>
                        {r.status === "assigned" ? "awaiting your submission" : r.status.replace("_", " ")}
                      </Badge>
                      {r.status === "sold" && (
                        <div className="text-xs text-green-400 mt-1">+₦{Number(r.payout_ngn ?? 0).toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  {(r.submitted_at || r.in_review_at || r.verified_at || r.rejected_at) && (
                    <StatusTimeline row={r} />
                  )}

                  {r.status === "assigned" && (
                    <div className="border-t border-slate-800 pt-3">
                      <Button size="sm" onClick={() => setWizardTfnId(r.id)}>
                        Submit for verification
                      </Button>
                    </div>
                  )}
                  {r.status === "pending_verification" && (
                    <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Carrier review in progress — updates automatically.</span>
                      <Button size="sm" variant="outline" disabled={refreshMut.isPending} onClick={() => refreshMut.mutate(r.id)}>
                        <RefreshCw className="size-3 mr-1" /> Refresh
                      </Button>
                    </div>
                  )}
                  {r.status === "rejected" && (
                    <div className="border-t border-slate-800 pt-3">
                      <Button size="sm" onClick={() => setWizardTfnId(r.id)}>
                        Fix &amp; resubmit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      <Dialog open={!!wizardTfnId} onOpenChange={(o) => !o && setWizardTfnId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Toll-free registration</DialogTitle>
          </DialogHeader>
          {wizardTfnId && (
            <TollfreeWizard
              submitting={submitAssignedMut.isPending}
              onClose={() => setWizardTfnId(null)}
              submitLabel="Submit for verification"
              onSubmit={async (form: WizardForm) => {
                await submitAssignedMut.mutateAsync({
                  id: wizardTfnId,
                  payload: form,
                });
                setWizardTfnId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusTimeline({ row }: { row: any }) {
  const steps: Array<{ key: string; label: string; at: string | null }> = [
    { key: "submitted", label: "Submitted", at: row.submitted_at ?? null },
    { key: "in_review", label: "In review", at: row.in_review_at ?? null },
    { key: "verified", label: "Verified", at: row.verified_at ?? null },
    { key: "rejected", label: "Rejected", at: row.rejected_at ?? null },
  ].filter((s) => (s.key === "rejected" ? !!row.rejected_at : s.key !== "rejected"))
   .concat(row.rejected_at ? [{ key: "rejected", label: "Rejected", at: row.rejected_at }] : []);

  return (
    <div className="border-t border-slate-800 pt-3">
      <div className="text-xs text-slate-400 mb-2">Timeline</div>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span
              className={`inline-block size-2 rounded-full ${
                s.at
                  ? s.key === "rejected"
                    ? "bg-red-500"
                    : s.key === "verified"
                    ? "bg-green-500"
                    : "bg-blue-500"
                  : "bg-slate-700"
              }`}
            />
            <span className={s.at ? "text-slate-200" : "text-slate-500"}>{s.label}</span>
            <span className="text-slate-500 ml-auto">
              {s.at ? new Date(s.at).toLocaleString() : "—"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

