import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bundleQuote } from "@/lib/email-campaign-rules";
import { CONTACT_STEPS } from "@/lib/email-plans";
import { purchaseEmailBundle, cancelEmailBundleRenewal } from "@/lib/email-campaigns.functions";

export function EmailBundles({ bundle, dailyCapacity }: { bundle: { plan: string; used: number; email_limit: number | null; contact_limit: number; paid_months: number; period_end: string; renew: boolean; status: string } | null; dailyCapacity: number }) {
  const [contacts, setContacts] = useState(500);
  const [confirm, setConfirm] = useState<"standard" | "pro" | null>(null);
  const [busy, setBusy] = useState(false);
  const buy = useServerFn(purchaseEmailBundle); const cancel = useServerFn(cancelEmailBundleRenewal); const qc = useQueryClient();
  const q = confirm ? bundleQuote(confirm, contacts, bundle?.paid_months ?? 0) : null;
  return <div className="space-y-5 border-t pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Monthly email bundle</h2><p className="text-sm text-muted-foreground capitalize">{bundle?.plan ?? "Free"} · {bundle?.used ?? 0} / {bundle?.email_limit === null ? "Unlimited" : bundle?.email_limit ?? 50} emails · {bundle?.contact_limit ?? 25} contacts</p></div><Select value={String(contacts)} onValueChange={(v) => setContacts(Number(v))}><SelectTrigger className="w-48" aria-label="Bundle contact count"><SelectValue /></SelectTrigger><SelectContent>{CONTACT_STEPS.map((c) => <SelectItem value={String(c)} key={c}>{c.toLocaleString()} contacts</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-4 md:grid-cols-3">{(["free", "standard", "pro"] as const).map((plan) => {
      const p = bundleQuote(plan, contacts, bundle?.paid_months ?? 0);
      return <div key={plan} className="space-y-3 rounded-lg border p-5"><div className="text-sm font-semibold capitalize">{plan}</div><div className="text-3xl font-bold">${p.price}<span className="text-sm font-normal text-muted-foreground"> /month</span></div><p className="text-sm">{p.contacts.toLocaleString()} contacts</p><p className="text-sm">{p.emails === null ? "Unlimited emails" : `${p.emails.toLocaleString()} emails /month`}</p>{plan !== "free" ? <Button className="w-full" variant={plan === "pro" ? "default" : "outline"} disabled={bundle?.plan !== undefined && bundle.plan !== "free" && bundle.status === "active"} onClick={() => setConfirm(plan)}><CreditCard className="size-4" />Choose {plan}</Button> : <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" />Included</div>}</div>;
    })}</div>
    <p className="text-sm text-muted-foreground">Delivery capacity: {dailyCapacity.toLocaleString()} emails per day across the platform. Excess emails stay queued for the next daily reset. Monthly bundles are paid from your Xellvio balance; the first three paid months are 30% off.</p>
    {bundle && bundle.plan !== "free" && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{bundle.status === "past_due" ? "Renewal payment needed" : `${bundle.renew ? "Renews" : "Ends"} ${new Date(bundle.period_end).toLocaleDateString()}`}</span>{bundle.renew && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await cancel(); qc.invalidateQueries({ queryKey: ["email-setup"] }); toast.success("Renewal cancelled. Your current bundle stays active until its end date."); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to cancel"); } finally { setBusy(false); } }}>Cancel renewal</Button>}</div>}
    <Dialog open={!!confirm} onOpenChange={(v) => { if (!busy && !v) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm monthly bundle</DialogTitle></DialogHeader>{q && <><p className="capitalize font-semibold">{confirm} · {q.contacts.toLocaleString()} contacts</p><p>${q.charge.toFixed(2)} will be deducted now. Renews monthly at ${q.price} after your first three discounted paid months. Cancel renewal at any time; no automatic refunds.</p><Button disabled={busy} onClick={async () => { if (!confirm) return; setBusy(true); try { await buy({ data: { plan: confirm, contacts, confirmed: true } }); qc.invalidateQueries({ queryKey: ["email-setup"] }); toast.success("Email bundle activated"); setConfirm(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to activate bundle"); } finally { setBusy(false); } }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}Confirm and pay ${q.charge.toFixed(2)}</Button></>}</DialogContent></Dialog>
  </div>;
}