import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminListAssistedNumbers, adminUpdateAssistedNumber } from "@/lib/assisted-number.functions";

const states = ["pending","in_review","documents_needed","carrier_pending","completed","rejected"] as const;
type State = typeof states[number];
type Request = Awaited<ReturnType<typeof adminListAssistedNumbers>>[number];
export function AdminAssistedNumbers() {
  const list = useServerFn(adminListAssistedNumbers);
  const requests = useQuery({ queryKey: ["admin-assisted-numbers"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const rows = (requests.data ?? []).filter((r) => `${r.requested_number} ${r.country} ${r.accounts?.email} ${r.accounts?.full_name} ${r.status}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4 border-b pb-8"><div><h2 className="text-xl font-semibold">Assisted calling-number verification</h2><p className="mt-1 text-sm text-muted-foreground">$100 paid requests · 24-hour handling target · carrier approval remains separate</p></div>
    <Input aria-label="Search assisted number requests" placeholder="Search business, number, country or status" value={search} onChange={(e) => setSearch(e.target.value)} />
    {requests.isPending ? <p className="text-sm text-muted-foreground">Loading assisted requests…</p> : requests.isError ? <p className="text-destructive">Could not load requests. <Button variant="link" onClick={() => requests.refetch()}>Retry</Button></p> : !rows.length ? <p className="text-sm text-muted-foreground">No assisted requests found.</p> : rows.map((r) => <AssistedRow key={r.id} request={r} />)}
  </section>;
}
function AssistedRow({ request: r }: { request: Request }) {
  const update = useServerFn(adminUpdateAssistedNumber), qc = useQueryClient();
  const [status, setStatus] = useState<State>(r.status as State), [notes, setNotes] = useState(r.admin_notes ?? "");
  const closed = ["completed", "rejected"].includes(r.status);
  const overdue = !closed && Date.now() > Date.parse(r.target_at);
  const mut = useMutation({ mutationFn: () => update({ data: { id: r.id, status, notes } }), onSuccess: async () => { toast.success("Assisted request updated"); await qc.invalidateQueries({ queryKey: ["admin-assisted-numbers"] }); }, onError: (e: Error) => toast.error(e.message) });
  const config = (r.receptionist?.configuration ?? {}) as Record<string, unknown>;
  return <article className="space-y-4 rounded-lg border bg-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{String(config.businessName || r.accounts?.full_name || "Business")} · {r.country}</h3><p className="text-sm text-muted-foreground">{r.accounts?.contact_email || r.accounts?.email}</p><p className="mt-1 font-mono">{r.requested_number} · {r.number_type}</p></div><div className="flex flex-wrap gap-2 items-start"><Badge variant="secondary">{r.status.replaceAll("_", " ")}</Badge><Badge variant="outline">${Number(r.fee_usd).toFixed(2)} paid</Badge>{overdue && <Badge variant="destructive">Handling target overdue</Badge>}</div></div>
    <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Business purpose</p><p className="whitespace-pre-line">{r.purpose}</p><p className="mt-2 text-xs text-muted-foreground">Handling target: {new Date(r.target_at).toLocaleString()}</p></div><div><p>Assigned line: <span className="font-mono">{r.receptionist?.voice_number ?? "Not ordered"}</span></p><p>Carrier checks: {r.receptionist?.provision_status ?? "Not configured"}</p><p>Documents: {r.receptionist?.requirement_group_id ? "Submission recorded" : "Not submitted"}</p><p>AI agent: {r.receptionist?.assistant_id ? "Created" : "Not created"}</p><p>Number billing: {r.receptionist?.number_billing_status ?? "Not started"}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-[180px_1fr]"><div><Label>Status</Label><Select value={status} onValueChange={(v) => setStatus(v as State)} disabled={closed}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{states.map((s) => <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Customer-visible notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={closed} placeholder="Documents required, progress or next steps" /></div></div>
    <div className="flex flex-wrap justify-end gap-2"><Button asChild variant="outline"><Link to="/admin/tickets/$id" params={{ id: r.ticket_id }}>Open support ticket</Link></Button><Button disabled={closed || mut.isPending} onClick={() => mut.mutate()}>Save request</Button></div><p className="text-xs text-muted-foreground">Completion requires the exact number to pass carrier checks. This does not approve texting or activate untested calling.</p>
  </article>;
}