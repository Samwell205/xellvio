import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, PhoneCall, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getMyDedicatedLine, requestDedicatedLine } from "@/lib/twilio-lines.functions";

const VOLUMES = ["1,000", "10,000", "100,000", "250,000", "500,000"] as const;

export function DedicatedLineCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyDedicatedLine);
  const reqFn = useServerFn(requestDedicatedLine);
  const { data, isLoading } = useQuery({ queryKey: ["dedicated-line"], queryFn: () => getFn(), staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const p = data?.prefill as any;
  const v = (k: string, fb = "") => f[k] ?? fb;
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: () => {
      const [first = "", ...rest] = String(p?.full_name ?? "").split(" ");
      return reqFn({ data: {
        businessName: v("businessName", p?.legal_business_name ?? ""), website: v("website", p?.website_url ?? ""),
        ein: v("ein", p?.business_reg_number ?? ""), street: v("street"), city: v("city"), state: v("state"),
        postalCode: v("postalCode"), country: v("country", "US"),
        contactFirstName: v("contactFirstName", first), contactLastName: v("contactLastName", rest.join(" ")),
        contactEmail: v("contactEmail", p?.contact_email ?? ""), contactPhone: v("contactPhone", p?.phone ?? ""),
        privacyUrl: v("privacyUrl", p?.privacy_policy_url ?? ""), termsUrl: v("termsUrl", p?.terms_url ?? ""),
        optInImageUrl: v("optInImageUrl", p?.opt_in_screenshot_url ?? ""),
        useCaseSummary: v("useCaseSummary", p?.use_case_description ?? ""), sampleMessage: v("sampleMessage", p?.sample_message ?? ""),
        monthlyVolume: v("monthlyVolume", "10,000") as any,
      } });
    },
    onSuccess: () => { toast.success("Request submitted. Carrier review usually takes a few days."); setOpen(false); qc.invalidateQueries({ queryKey: ["dedicated-line"] }); },
    onError: (e: any) => {
      let msg = e?.message ?? "Something went wrong";
      try { const issues = JSON.parse(msg); if (Array.isArray(issues)) msg = issues.map((i: any) => `${i.path?.join(".")}: ${i.message}`).join(" · "); } catch { /* plain text */ }
      toast.error(msg); qc.invalidateQueries({ queryKey: ["dedicated-line"] });
    },
  });

  if (isLoading) return null;
  const line = data?.line as any;
  const fee = data?.monthlyFee ?? 5;

  const field = (k: string, label: string, fb = "", ph = "") => (
    <div className="space-y-1.5"><Label htmlFor={`dl-${k}`}>{label}</Label><Input id={`dl-${k}`} value={v(k, fb)} onChange={set(k)} placeholder={ph} /></div>
  );

  return (
    <Card className="p-6 space-y-4 rounded-3xl" style={{ animation: "bento-rise .5s .25s cubic-bezier(.2,.8,.2,1) both" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2"><PhoneCall className="size-4 text-primary" /> Your own toll-free number (US & Canada)</div>
          <p className="text-sm text-muted-foreground mt-1">A number registered only to your business, kept separate from every other sender. ${fee.toFixed(2)}/month from your credit.</p>
        </div>
        {line?.status === "active" && <Badge className="gap-1"><CheckCircle2 className="size-3" /> Live</Badge>}
        {line?.status === "verification_pending" && <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> In review</Badge>}
        {line?.status === "rejected" && <Badge variant="destructive" className="gap-1"><AlertCircle className="size-3" /> Needs changes</Badge>}
      </div>

      {line?.phone_number && <div className="text-lg font-semibold tracking-wide">{line.phone_number}</div>}
      {line?.status === "verification_pending" && <p className="text-sm text-muted-foreground">Carriers are reviewing your business. Texts start from this number once approved, usually within a few days.</p>}
      {line?.status === "active" && <p className="text-sm text-muted-foreground">Your US and Canada texts now send from this number first.{line.billing_status === "past_due" ? " Your monthly fee is overdue — add credit to keep using it." : ""}</p>}
      {line?.status_detail && line.status !== "active" && <p className="text-sm text-destructive">{line.status_detail}</p>}

      {(!line || line.status === "rejected" || (line.status !== "active" && line.status !== "verification_pending")) && !open && (
        <Button onClick={() => setOpen(true)}>{line ? "Update and resubmit" : "Request my own number"}</Button>
      )}

      {open && (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          {field("businessName", "Legal business name", p?.legal_business_name ?? "")}
          <div className="space-y-1.5"><Label htmlFor="dl-ein">EIN (optional)</Label><Input id="dl-ein" value={v("ein", p?.business_reg_number ?? "")} onChange={set("ein")} placeholder="12-3456789" /><p className="text-xs text-muted-foreground">No EIN? Leave it empty and we submit you as a sole proprietor.</p></div>
          {field("website", "Website", p?.website_url ?? "", "https://")}
          {field("street", "Street address")}
          {field("city", "City")}
          {field("state", "State / province")}
          {field("postalCode", "ZIP / postal code")}
          {field("country", "Country (2 letters)", "US")}
          {field("contactFirstName", "Contact first name", String(p?.full_name ?? "").split(" ")[0])}
          {field("contactLastName", "Contact last name", String(p?.full_name ?? "").split(" ").slice(1).join(" "))}
          {field("contactEmail", "Contact email", p?.contact_email ?? "")}
          {field("contactPhone", "Contact phone", p?.phone ?? "", "+15551234567")}
          {field("privacyUrl", "Privacy policy link", p?.privacy_policy_url ?? "")}
          {field("termsUrl", "SMS terms link", p?.terms_url ?? "")}
          <div className="sm:col-span-2">{field("optInImageUrl", "Link to a screenshot of your signup form with the SMS consent checkbox", p?.opt_in_screenshot_url ?? "")}</div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="dl-use">What you'll text about</Label><Textarea id="dl-use" value={v("useCaseSummary", p?.use_case_description ?? "")} onChange={set("useCaseSummary")} rows={3} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="dl-sample">Sample message (include STOP)</Label><Textarea id="dl-sample" value={v("sampleMessage", p?.sample_message ?? "")} onChange={set("sampleMessage")} rows={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="dl-vol">Texts per month</Label>
            <select id="dl-vol" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={v("monthlyVolume", "10,000")} onChange={set("monthlyVolume")}>
              {VOLUMES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <Button type="submit" disabled={submit.isPending}>{submit.isPending && <Loader2 className="size-4 animate-spin" />} Submit — ${fee.toFixed(2)} first month</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
