import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyTransactions } from "@/lib/verifier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_verifier/verify/dashboard/earnings")({
  component: EarningsPage,
});

function EarningsPage() {
  const listTx = useServerFn(listMyTransactions);
  const { data } = useQuery({ queryKey: ["verifier","tx"], queryFn: () => listTx() });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Earnings</h1>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent>
          {(data ?? []).length === 0 ? (
            <div className="text-sm text-slate-400">No transactions yet.</div>
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between border border-slate-800 rounded-md p-3">
                  <div>
                    <div className="text-sm">{t.description}</div>
                    <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono ${Number(t.amount_ngn) < 0 ? "text-red-400" : "text-green-400"}`}>
                      {Number(t.amount_ngn) < 0 ? "" : "+"}₦{Number(t.amount_ngn).toLocaleString()}
                    </div>
                    <Badge variant="outline" className="text-xs">{t.type}</Badge>
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
