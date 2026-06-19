import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, Search, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateSegments } from "@/lib/sms-segments";
import { formatUSD, formatRate } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/app/pricing-calculator")({
  head: () => ({ meta: [{ title: "SMS Pricing — SAMWELL SMS HUB" }] }),
  component: PricingCalculatorPage,
});

function PricingCalculatorPage() {
  const ratesQ = useQuery({
    queryKey: ["country-rates-all"],
    queryFn: async () => (await supabase.from("country_rates").select("country_code,country_name,dial_prefix,sell_price,mms_multiplier,active,sender_supports_inbound").order("country_name")).data ?? [],
  });
  const rates = ratesQ.data ?? [];

  const [country, setCountry] = useState<string>("US");
  const [body, setBody] = useState<string>("Hi {{first_name}}, our sale is live. Reply STOP to unsubscribe.");
  const [recipients, setRecipients] = useState<number>(1000);
  const [search, setSearch] = useState<string>("");

  const seg = useMemo(() => calculateSegments(body), [body]);
  const rate = rates.find((r) => r.country_code === country);
  const unit = rate ? Number(rate.sell_price) : 0;
  const perSms = +(seg.segments * unit).toFixed(4);
  const total = +(perSms * Math.max(0, recipients || 0)).toFixed(2);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rates.filter((r) =>
      r.country_name.toLowerCase().includes(q) ||
      r.country_code.toLowerCase().includes(q) ||
      r.dial_prefix.includes(q),
    );
  }, [rates, search]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Calculator className="size-6" /> SMS Pricing</h1>
        <p className="text-sm text-muted-foreground">Estimate cost per country, per message, instantly.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5 space-y-4">
          <div>
            <Label>Destination country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {rates.map((r) => (
                  <SelectItem key={r.country_code} value={r.country_code}>{r.country_name} ({r.dial_prefix})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="text-xs text-muted-foreground mt-1">{seg.encoding} · {seg.charCount} chars · {seg.segments} segment{seg.segments !== 1 ? "s" : ""}</div>
          </div>
          <div>
            <Label>Number of recipients</Label>
            <Input type="number" min={0} value={recipients} onChange={(e) => setRecipients(Number(e.target.value))} />
          </div>
        </Card>

        <Card className="p-5 space-y-3 self-start bg-gradient-to-br from-primary/10 to-transparent">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">Estimate</div>
          <Row label={`Rate for ${rate?.country_name ?? country}`} value={`${formatRate(unit)} per segment`} />
          <Row label="Segments per message" value={String(seg.segments)} />
          <Row label="Cost per SMS" value={formatUSD(perSms)} />
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground">Total for {recipients.toLocaleString()} recipients</div>
            <div className="text-4xl font-extrabold mt-1">{formatUSD(total)}</div>
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2"><Globe className="size-4" /> Per-country pricing</h3>
          <div className="relative w-full max-w-xs">
            <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country or dial prefix" className="pl-8" />
          </div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr><th className="text-left p-3">Country</th><th className="text-left p-3">Dial</th><th className="text-right p-3">Per SMS</th><th className="text-right p-3">MMS ×</th><th className="text-left p-3">Inbound</th><th className="text-left p-3">Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.country_code} className="border-t">
                  <td className="p-3"><div className="font-medium">{r.country_name}</div><div className="text-xs text-muted-foreground">{r.country_code}</div></td>
                  <td className="p-3 tabular-nums">{r.dial_prefix}</td>
                  <td className="p-3 text-right tabular-nums">{formatRate(Number(r.sell_price))}</td>
                  <td className="p-3 text-right tabular-nums">×{Number(r.mms_multiplier).toFixed(1)}</td>
                  <td className="p-3">{r.sender_supports_inbound ? <Badge variant="default">Yes</Badge> : <Badge variant="outline">No</Badge>}</td>
                  <td className="p-3">{r.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Off</Badge>}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No countries match "{search}".</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
