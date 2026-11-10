import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, Search, Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { calculateSegments } from "@/lib/sms-segments";
import { formatUSD, formatRate } from "@/lib/money";
import { getPublicCountryRates } from "@/lib/public-pricing.functions";

export const Route = createFileRoute("/_authenticated/app/pricing-calculator")({
  head: () => ({ meta: [{ title: "SMS Pricing — Xellvio" }] }),
  component: PricingCalculatorPage,
});

function PricingCalculatorPage() {
  const loadRates = useServerFn(getPublicCountryRates);
  const ratesQ = useQuery({
    queryKey: ["country-rates-all"],
    queryFn: () => loadRates(),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const rates = ratesQ.data ?? [];

  const [country, setCountry] = useState<string>("US");
  const [body, setBody] = useState<string>(
    "Hi {{first_name}}, our sale is live. Reply STOP to unsubscribe.",
  );
  const [recipients, setRecipients] = useState<number>(1000);
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    if (rates.length > 0 && !rates.some((r) => r.code === country)) {
      setCountry(rates[0].code);
    }
  }, [country, rates]);

  const seg = useMemo(() => calculateSegments(body), [body]);
  const rate = rates.find((r) => r.code === country);
  const unit = rate ? Number(rate.perSms) : 0;
  const perSms = +(seg.segments * unit).toFixed(4);
  const total = +(perSms * Math.max(0, recipients || 0)).toFixed(2);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rates.filter(
      (r) =>
        r.country.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.dial.includes(q),
    );
  }, [rates, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex min-w-0 items-center gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Calculator className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">SMS pricing</h1>
          <p className="text-sm text-muted-foreground">
            Type your message, pick a country and see exactly what a send will cost.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="space-y-5 rounded-3xl p-6">
          <div>
            <Label>Destination country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue
                  placeholder={ratesQ.isLoading ? "Loading countries…" : "Select country"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {rates.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.country} ({r.dial})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1.5 resize-none" />
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{seg.encoding}</span>
              <span className="rounded-full bg-muted px-2.5 py-1 tabular-nums text-muted-foreground">{seg.charCount} characters</span>
              <span className={`rounded-full px-2.5 py-1 tabular-nums ${seg.segments > 1 ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>
                {seg.segments} segment{seg.segments !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div>
            <Label>Number of recipients</Label>
            <Input
              type="number"
              min={0}
              value={recipients}
              onChange={(e) => setRecipients(Number(e.target.value))}
            />
          </div>
        </Card>

        <Card className="relative space-y-4 self-start overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 lg:sticky lg:top-20">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Total for {recipients.toLocaleString()} recipients
            </div>
            <div className="mt-2 text-5xl font-bold tracking-tight tabular-nums">{formatUSD(total)}</div>
          </div>
          <div className="relative space-y-3 rounded-2xl border bg-background/70 p-4 backdrop-blur">
          <Row
            label={`Rate for ${rate?.country ?? country}`}
            value={`${formatRate(unit)} per segment`}
          />
          <Row label="Segments per message" value={String(seg.segments)} />
          <Row label="Cost per SMS" value={formatUSD(perSms)} />
          </div>
          <p className="relative text-xs text-muted-foreground">
            Longer messages, emojis and pictures use more segments and cost more.
          </p>
        </Card>
      </div>

      <Card className="space-y-4 rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2">
            <Globe className="size-4" /> Per-country pricing
          </h3>
          <div className="relative w-full max-w-xs">
            <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or dial prefix"
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[560px] overflow-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-3">Country</th>
                <th className="text-left p-3">Dial</th>
                <th className="text-right p-3">Per SMS</th>
                <th className="text-right p-3">MMS ×</th>
                <th className="text-left p-3">Inbound</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.code} onClick={() => setCountry(r.code)} className={`cursor-pointer border-t transition-colors hover:bg-muted/40 ${r.code === country ? "bg-primary/5" : ""}`}>
                  <td className="p-3">
                    <div className="font-medium">{r.country}</div>
                    <div className="text-xs text-muted-foreground">{r.code}</div>
                  </td>
                  <td className="p-3 tabular-nums">{r.dial}</td>
                  <td className="p-3 text-right tabular-nums">{formatRate(Number(r.perSms))}</td>
                  <td className="p-3 text-right tabular-nums">×{Number(r.mmsMult).toFixed(1)}</td>
                  <td className="p-3">
                    {r.inbound ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {r.status === "Active" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success"><span className="size-1.5 rounded-full bg-success" />Active</span>
                    ) : (
                      <Badge variant="destructive">Off</Badge>
                    )}
                  </td>
                </tr>
              ))}

              {ratesQ.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                    Loading countries…
                  </td>
                </tr>
              )}
              {ratesQ.isError && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-destructive">
                    Pricing could not load. Refresh the page or try again shortly.
                  </td>
                </tr>
              )}
              {!ratesQ.isLoading && !ratesQ.isError && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                    No countries match "{search}".
                  </td>
                </tr>
              )}
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
