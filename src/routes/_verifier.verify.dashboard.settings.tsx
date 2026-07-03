import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createVerifierProfile,
  getMyVerifier,
  listVerifierBanks,
  resolveVerifierBank,
  saveVerifierBank,
} from "@/lib/verifier.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_verifier/verify/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const getV = useServerFn(getMyVerifier);
  const createProfile = useServerFn(createVerifierProfile);
  const listBanks = useServerFn(listVerifierBanks);
  const resolve = useServerFn(resolveVerifierBank);
  const save = useServerFn(saveVerifierBank);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({ queryKey: ["verifier","me"], queryFn: () => getV() });
  const { data: banks } = useQuery({ queryKey: ["verifier","banks"], queryFn: () => listBanks(), staleTime: 3600_000 });

  const [fullName, setFullName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (profile?.bank) {
      setBankCode(profile.bank.bank_code);
      setAccountNumber(profile.bank.account_number);
      setResolvedName(profile.bank.account_name);
    }
  }, [profile?.bank]);

  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      setResolving(true);
      setResolvedName(null);
      resolve({ data: { account_number: accountNumber, bank_code: bankCode } })
        .then(r => setResolvedName(r.account_name))
        .catch((e: any) => toast.error(e.message))
        .finally(() => setResolving(false));
    }
  }, [accountNumber, bankCode]);

  const profileMut = useMutation({
    mutationFn: () => createProfile({ data: { full_name: fullName } }),
    onSuccess: () => { toast.success("Profile created"); qc.invalidateQueries({ queryKey: ["verifier","me"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const bankMut = useMutation({
    mutationFn: () => {
      const b = (banks ?? []).find(x => x.code === bankCode);
      return save({ data: { bank_code: bankCode, bank_name: b?.name ?? "Bank", account_number: accountNumber } });
    },
    onSuccess: () => { toast.success("Bank details saved"); qc.invalidateQueries({ queryKey: ["verifier","me"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-slate-400">Loading…</div>;

  if (!profile?.verifier) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Complete your verifier profile</h1>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-6 space-y-3">
            <div><Label>Full name</Label><Input value={fullName} onChange={e=>setFullName(e.target.value)} /></div>
            <Button disabled={profileMut.isPending || !fullName} onClick={()=>profileMut.mutate()}>Create profile</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-semibold">Bank details</h1>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>Payout account</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger><SelectValue placeholder="Select bank"/></SelectTrigger>
              <SelectContent className="max-h-72">
                {(banks ?? []).map(b => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Account number (10 digits)</Label>
            <Input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} />
          </div>
          <div className="min-h-6 text-sm">
            {resolving && <span className="flex items-center gap-2 text-slate-400"><Loader2 className="size-3 animate-spin"/>Resolving…</span>}
            {resolvedName && <span className="flex items-center gap-2 text-green-400"><CheckCircle2 className="size-4"/>{resolvedName}</span>}
          </div>
          <Button disabled={bankMut.isPending || !resolvedName} onClick={()=>bankMut.mutate()}>Save bank details</Button>
        </CardContent>
      </Card>
    </div>
  );
}
