import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyVerifier, listMyWithdrawals, requestWithdrawal } from "@/lib/verifier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_verifier/verify/dashboard/withdrawals")({
  component: WithdrawalsPage,
});

function WithdrawalsPage() {
  const getV = useServerFn(getMyVerifier);
  const listWd = useServerFn(listMyWithdrawals);
  const req = useServerFn(requestWithdrawal);
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["verifier","me"], queryFn: () => getV() });
  const { data: rows } = useQuery({ queryKey: ["verifier","withdrawals"], queryFn: () => listWd() });
  const [amount, setAmount] = useState("");
  const balance = Number(profile?.wallet?.balance_ngn ?? 0);

  const mutation = useMutation({
    mutationFn: () => req({ data: { amount_ngn: Number(amount) } }),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["verifier","withdrawals"] });
      qc.invalidateQueries({ queryKey: ["verifier","me"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Withdrawals</h1>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Request withdrawal</CardTitle>
          <div className="text-sm text-slate-400 mt-1">Available: ₦{balance.toLocaleString()}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          <Button disabled={mutation.isPending || !amount || Number(amount) <= 0 || Number(amount) > balance} onClick={()=>mutation.mutate()}>Request payout</Button>
          <div className="text-xs text-slate-500">Payouts are processed manually to your bank account within 24–48h.</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          {(rows ?? []).length === 0 ? (
            <div className="text-sm text-slate-400">No withdrawals yet.</div>
          ) : (
            <div className="space-y-2">
              {(rows ?? []).map((w: any) => (
                <div key={w.id} className="flex items-center justify-between border border-slate-800 rounded-md p-3">
                  <div>
                    <div className="font-mono">₦{Number(w.amount_ngn).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Requested {new Date(w.requested_at).toLocaleString()}</div>
                    {w.admin_note && <div className="text-xs text-slate-400 mt-1">Note: {w.admin_note}</div>}
                  </div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "outline"}>{w.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
