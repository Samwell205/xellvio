import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyTfns, submitTfn } from "@/lib/verifier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_verifier/verify/dashboard/numbers")({
  component: NumbersPage,
});

function NumbersPage() {
  const list = useServerFn(listMyTfns);
  const submit = useServerFn(submitTfn);
  const qc = useQueryClient();
  const { data: rows } = useQuery({ queryKey: ["verifier","tfns"], queryFn: () => list() });
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => submit({ data: { phone_number: phone, country: "US", notes } }),
    onSuccess: () => {
      toast.success("Number submitted for verification");
      setPhone(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["verifier","tfns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My numbers</h1>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>Submit a toll-free number</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Phone number (E.164)</Label><Input placeholder="+18885551234" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
          <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any context our team should know" /></div>
          <Button disabled={mutation.isPending || !phone} onClick={()=>mutation.mutate()}>Submit for verification</Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>Submitted numbers</CardTitle></CardHeader>
        <CardContent>
          {(rows ?? []).length === 0 ? (
            <div className="text-sm text-slate-400">No numbers submitted yet.</div>
          ) : (
            <div className="space-y-2">
              {(rows ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between border border-slate-800 rounded-md p-3">
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
                    }>{r.status.replace("_"," ")}</Badge>
                    {r.status === "sold" && (
                      <div className="text-xs text-green-400 mt-1">+₦{Number(r.payout_ngn ?? 0).toLocaleString()}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
