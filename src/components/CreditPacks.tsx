import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPublicCreditPacks } from "@/lib/public-packs.functions";
import { supabase } from "@/integrations/supabase/client";

const CUSTOM = "__custom__";

function formatUSD(n: number) {
  return `$${n.toFixed(2)}`;
}

export function CreditPacks() {
  const navigate = useNavigate();
  const loadPacks = useServerFn(getPublicCreditPacks);
  const packsQ = useQuery({ queryKey: ["public-credit-packs"], queryFn: () => loadPacks() });
  const packs = packsQ.data ?? [];

  const [selected, setSelected] = useState<string>(CUSTOM);
  const [customAmount, setCustomAmount] = useState<number>(50);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!packs.length) return;
    const popular = packs.find((p) => p.is_popular);
    setSelected((s) => (s === CUSTOM ? popular?.id ?? packs[0].id : s));
  }, [packs]);

  const pack = packs.find((p) => p.id === selected);
  const isCustom = selected === CUSTOM;
  const amount = isCustom ? customAmount : pack?.price ?? 0;
  const credits = isCustom ? customAmount : pack?.credits ?? 0;

  async function handlePay() {
    setBusy(true);
    const params = new URLSearchParams();
    if (isCustom) params.set("amount", String(customAmount));
    else params.set("pack", selected);
    const dest = `/app/billing?${params.toString()}`;
    const { data } = await supabase.auth.getSession();
    if (data.session) navigate({ to: dest });
    else navigate({ to: "/auth", search: { redirect: dest } as any });
  }

  return (
    <section className="bg-background py-16 border-t border-border">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-2xl font-extrabold tracking-tight">Buy credits</h2>
          </div>
          <p className="text-sm text-muted-foreground">Priced in USD · paid securely via Paystack</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 grid sm:grid-cols-[1fr_auto] gap-6 items-end">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Choose a pack</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a pack" /></SelectTrigger>
                <SelectContent>
                  {packs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name.replace(/\s*USD$/, "")} — {formatUSD(p.price)} ({formatUSD(p.credits)} credits)
                      {p.is_popular ? " · Popular" : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom amount…</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Packs run from $5 up to $500. Need more? Pick <em>Custom amount</em>.
              </p>
            </div>

            {isCustom && (
              <div>
                <Label className="text-sm font-semibold">Custom amount (USD)</Label>
                <Input
                  type="number"
                  min={5}
                  max={10000}
                  step={1}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(Number(e.target.value))}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">1 USD = 1 credit · min $5, max $10,000</p>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-primary/10 p-5 min-w-[220px]">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">You pay</div>
            <div className="text-4xl font-extrabold tabular-nums mt-1">{formatUSD(amount)}</div>
            <div className="text-sm text-muted-foreground mt-1">≈ {formatUSD(credits)} in credits</div>
            <Button
              className="mt-4 w-full"
              onClick={handlePay}
              disabled={busy || packsQ.isLoading || (isCustom && (customAmount < 5 || customAmount > 10000))}
            >
              Pay with Paystack
            </Button>
            <Link to="/auth" className="block text-center text-xs text-muted-foreground mt-2 hover:underline">
              New here? Create a free account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
