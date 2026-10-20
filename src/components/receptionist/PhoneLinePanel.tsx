import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2, MessageSquare, Phone, PhoneForwarded, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buyReceptionistNumber,
  refreshReceptionistNumber,
  searchReceptionistNumbers,
  setupReceptionistAgent,
} from "@/lib/receptionist.functions";

type NumberRow = { phoneNumber: string; type: string; locality: string | null; canCall: boolean; canText: boolean; monthlyUsd: number };
const COUNTRIES = [["GB", "United Kingdom"], ["US", "United States"], ["CA", "Canada"], ["IE", "Ireland"], ["AU", "Australia"]] as const;
const TYPES = [["mobile", "Mobile (calls + texts)"], ["local", "Local (calls only in UK)"], ["national", "National 03 (calls only)"], ["toll-free", "Freephone 0800 (calls only)"]] as const;
const STATUS: Record<string, string> = {
  verified: "Ready", number_pending: "Being activated", documents_needed: "Address proof needed", number_failed: "Order failed", not_configured: "No number yet",
};

export function PhoneLinePanel({ data, onChange }: {
  data: { isOwner: boolean; number: string | null; numberType: string | null; provisionStatus: string; hasAgent: boolean; perMinuteUsd: number; numberMonthlyUsd: number; config: { businessName: string; phoneMode: string } };
  onChange: () => Promise<unknown> | void;
}) {
  const search = useServerFn(searchReceptionistNumbers);
  const buy = useServerFn(buyReceptionistNumber);
  const refresh = useServerFn(refreshReceptionistNumber);
  const agent = useServerFn(setupReceptionistAgent);
  const [country, setCountry] = useState("GB");
  const [type, setType] = useState<string>("mobile");
  const [region, setRegion] = useState("");
  const [results, setResults] = useState<NumberRow[]>([]);
  const [confirm, setConfirm] = useState<NumberRow | null>(null);

  const searchMut = useMutation({
    mutationFn: () => search({ data: { country, type: type as any, region: region || undefined } }),
    onSuccess: (r) => { setResults(r); if (!r.length) toast.message("No numbers found — try another type or area"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const buyMut = useMutation({
    mutationFn: (n: NumberRow) => buy({ data: { phoneNumber: n.phoneNumber, type: n.type, confirmed: true } }),
    onSuccess: async (r) => { setConfirm(null); setResults([]); toast.success(r.status === "verified" ? `${r.phoneNumber} is yours` : `${r.phoneNumber} ordered — ${STATUS[r.status] ?? r.status}`); await onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const refreshMut = useMutation({ mutationFn: () => refresh(), onSuccess: async () => { await onChange(); }, onError: (e: Error) => toast.error(e.message) });
  const agentMut = useMutation({
    mutationFn: () => agent(),
    onSuccess: async (r) => { toast.success(r.updated ? "AI voice agent updated" : "AI voice agent created"); await onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const textCapable = data.numberType === "mobile" || (data.number && !data.number.startsWith("+44"));

  return (
    <section className="grid gap-6 border-b pb-8 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-lg font-semibold">Phone line & AI agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">${data.numberMonthlyUsd.toFixed(2)}/month per number · ${data.perMinuteUsd.toFixed(2)}/minute answered</p>
      </div>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">AI voice agent</p>
              <p className="text-sm text-muted-foreground">{data.hasAgent ? "Ready. Update it after changing your business details." : "Save your business details below, then create the agent."}</p>
            </div>
          </div>
          <Button type="button" disabled={!data.isOwner || agentMut.isPending} onClick={() => agentMut.mutate()}>
            {agentMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{data.hasAgent ? "Update agent" : "Create AI agent"}
          </Button>
        </div>

        {data.number ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Phone className="h-5 w-5 text-primary" />
              <span className="font-mono text-lg">{data.number}</span>
              <Badge variant={data.provisionStatus === "verified" ? "default" : "secondary"}>{STATUS[data.provisionStatus] ?? data.provisionStatus}</Badge>
              <Badge variant="outline" className="gap-1">{textCapable ? <><MessageSquare className="h-3 w-3" />Calls + texts</> : "Calls only"}</Badge>
              {data.provisionStatus !== "verified" && <Button type="button" size="sm" variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>Check status</Button>}
            </div>
            {data.provisionStatus === "documents_needed" && <p className="text-sm text-muted-foreground">UK regulators require a business address for this number. Contact support with proof of address and we'll finish activation.</p>}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium"><PhoneForwarded className="h-4 w-4" />Call forwarding (keep your existing number)</p>
              <p className="mt-1 text-muted-foreground">Ask your phone provider to forward <b>unanswered or busy</b> calls to <span className="font-mono">{data.number}</span>. On most UK mobiles, dial:</p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                <li>**61*{data.number}# — forward when unanswered</li>
                <li>**67*{data.number}# — forward when busy</li>
                <li>**62*{data.number}# — forward when unreachable</li>
                <li>##002# — cancel all forwarding</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Landlines and VoIP systems: turn on "forward on no answer" in your provider's settings. Or simply give customers the new number directly.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5"><Label>Country</Label>
                <Select value={country} onValueChange={setCountry}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRIES.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(([v, n]) => <SelectItem key={v} value={v}>{n}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>City (optional)</Label><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. London" /></div>
              <Button type="button" variant="outline" disabled={!data.isOwner || searchMut.isPending} onClick={() => searchMut.mutate()}>
                {searchMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Search
              </Button>
            </div>
            {country === "GB" && <p className="text-xs text-muted-foreground">In the UK only mobile (07) numbers can send and receive texts. Freephone, local and 03 numbers take calls only.</p>}
            {results.length > 0 && (
              <div className="divide-y rounded-lg border">
                {results.map((n) => (
                  <div key={n.phoneNumber} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <div className="font-mono">{n.phoneNumber}</div>
                      <div className="text-xs text-muted-foreground">{[n.locality, n.canText ? "Calls + texts" : "Calls only"].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Button type="button" size="sm" onClick={() => setConfirm(n)}>Buy · ${n.monthlyUsd.toFixed(2)}/mo</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buy {confirm?.phoneNumber}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">${confirm?.monthlyUsd.toFixed(2)} is taken from your credits now for the first month. Answered calls cost ${data.perMinuteUsd.toFixed(2)} per minute. {confirm?.canText ? "This number can also send and receive texts." : "This number takes calls only."}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button disabled={buyMut.isPending} onClick={() => confirm && buyMut.mutate(confirm)}>{buyMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
