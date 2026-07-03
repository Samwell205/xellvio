import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyVerifier, listMyWithdrawals } from "@/lib/verifier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, ClipboardList } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_verifier/verify/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const getV = useServerFn(getMyVerifier);
  const listWd = useServerFn(listMyWithdrawals);
  const { data: profile } = useQuery({ queryKey: ["verifier","me"], queryFn: () => getV() });
  const { data: wds } = useQuery({ queryKey: ["verifier","withdrawals"], queryFn: () => listWd() });

  if (profile && !profile.verifier) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Complete your profile</h1>
        <p className="text-slate-400">Set up your bank details to start submitting numbers.</p>
        <Link to="/verify/dashboard/settings"><Button>Set up bank details</Button></Link>
      </div>
    );
  }

  const pending = (wds ?? []).filter((w: any) => w.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome{profile?.verifier ? `, ${profile.verifier.full_name.split(" ")[0]}` : ""}</h1>
        <p className="text-slate-400 text-sm">Track your numbers, wallet, and payouts.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400 flex items-center gap-2"><Wallet className="size-4"/>Wallet balance</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">₦{Number(profile?.wallet?.balance_ngn ?? 0).toLocaleString()}</div></CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400 flex items-center gap-2"><TrendingUp className="size-4"/>Lifetime earned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">₦{Number(profile?.wallet?.lifetime_earned_ngn ?? 0).toLocaleString()}</div></CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400 flex items-center gap-2"><ClipboardList className="size-4"/>Pending payouts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{pending}</div></CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Link to="/verify/dashboard/numbers"><Button>Submit a number</Button></Link>
        <Link to="/verify/dashboard/withdrawals"><Button variant="outline">Request withdrawal</Button></Link>
      </div>
    </div>
  );
}
