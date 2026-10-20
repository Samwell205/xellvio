import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { listMyAssistedNumbers, submitAssistedNumber } from "@/lib/assisted-number.functions";
import { ASSISTED_NUMBER_FEE_USD, ASSISTED_NUMBER_TARGET_HOURS } from "@/lib/receptionist/assisted";

export function AssistedNumberPanel({ country, numberType, phoneNumber, isOwner }: { country: string; numberType: "mobile" | "local" | "national" | "toll-free"; phoneNumber?: string | null; isOwner: boolean }) {
  const list = useServerFn(listMyAssistedNumbers), submit = useServerFn(submitAssistedNumber);
  const qc = useQueryClient();
  const requests = useQuery({ queryKey: ["my-assisted-numbers"], queryFn: () => list() });
  const [open, setOpen] = useState(false), [phone, setPhone] = useState(""), [purpose, setPurpose] = useState("");
  const mutation = useMutation({ mutationFn: () => submit({ data: { country, numberType, phoneNumber: phone, purpose, confirmed: true } }), onSuccess: async () => { setOpen(false); toast.success("Assisted verification requested — your support ticket is open."); await qc.invalidateQueries({ queryKey: ["my-assisted-numbers"] }); }, onError: (e: Error) => toast.error(e.message) });
  const active = requests.data?.find((r) => !["completed", "rejected"].includes(r.status));
  return <div className="border-t pt-5 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="flex items-center gap-2 font-medium"><Headphones className="size-4 text-primary" />Support-assisted verification</h3><p className="mt-1 text-sm text-muted-foreground">${ASSISTED_NUMBER_FEE_USD} one-time for help with your chosen number and its verification.</p></div>
      <Button variant="outline" disabled={!isOwner || Boolean(active) || requests.isPending || requests.isError} onClick={() => { setPhone(phoneNumber ?? ""); setOpen(true); }}>Request assistance</Button>
    </div>
    <p className="text-xs text-muted-foreground">{ASSISTED_NUMBER_TARGET_HOURS}-hour support handling target. Required business documents still apply. Number availability and carrier approval times vary; payment does not bypass verification. Monthly number and call charges are separate.</p>
    {requests.isError && <p className="text-sm text-destructive">Could not load your requests. <Button variant="link" onClick={() => requests.refetch()}>Retry</Button></p>}
    {requests.data?.slice(0, 3).map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-primary pl-3 text-sm"><div><span className="font-mono">{r.requested_number}</span> <Badge variant="secondary">{r.status.replaceAll("_", " ")}</Badge><p className="mt-1 text-xs text-muted-foreground">${Number(r.fee_usd).toFixed(2)} paid · Handling target: {new Date(r.target_at).toLocaleString()}</p>{r.admin_notes && <p className="mt-1 whitespace-pre-line">{r.admin_notes}</p>}</div><Button asChild variant="link" size="sm"><Link to="/app/support">View support tickets</Link></Button></div>)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Request assisted verification</DialogTitle><DialogDescription>{country} · {numberType.replaceAll("-", " ")} · ${ASSISTED_NUMBER_FEE_USD} from your credits</DialogDescription></DialogHeader>
      <div className="space-y-3"><div><Label htmlFor="assisted-phone">Exact number you want</Label><Input id="assisted-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+442012345678" /></div><div><Label htmlFor="assisted-purpose">How will your business use it?</Label><Textarea id="assisted-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Calls, texts, your business purpose and any verification help needed" /></div><p className="text-sm text-muted-foreground">Support handles your request within a {ASSISTED_NUMBER_TARGET_HOURS}-hour target. We cannot guarantee approval or reserve an unavailable number. We will ask for any required documents through your ticket.</p><p className="text-xs text-muted-foreground">The assistance fee does not include recurring number fees or call usage. No automatic refund is issued if a request is rejected.</p></div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={mutation.isPending || !/^\+[1-9]\d{6,14}$/.test(phone.trim()) || purpose.trim().length < 10} onClick={() => mutation.mutate()}>{mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Pay ${ASSISTED_NUMBER_FEE_USD} & request</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}