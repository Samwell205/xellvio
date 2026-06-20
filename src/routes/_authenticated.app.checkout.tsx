import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CreditCard, Bitcoin, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatUSD } from "@/lib/money";
import { listCreditPacks, initPaystackCheckout, initPaystackCheckoutCustom } from "@/lib/billing-packs.functions";
import { initNowPaymentsCheckout, initNowPaymentsCheckoutCustom } from "@/lib/nowpayments.functions";

export const Route = createFileRoute("/_authenticated/app/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Xellvio" }] }),
  validateSearch: (s: Record<string, unknown>) =>
    z.object({
      pack: z.string().uuid().optional(),
      amount: z.coerce.number().min(5).max(10000).optional(),
    }).parse(s),
  component: CheckoutPage,
});

type Method = "paystack" | "crypto";
const COINS = [
  { value: "usdttrc20", label: "USDT (TRC20)" },
  { value: "usdtbsc", label: "USDT (BSC)" },
  { value: "usdcbsc", label: "USDC (BSC)" },
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
];

function CheckoutPage() {
  const { pack: packParam, amount: amountParam } = Route.useSearch();
  const navigate = useNavigate();

  const loadPacks = useServerFn(listCreditPacks);
  const packsQ = useQuery({ queryKey: ["credit-packs"], queryFn: () => loadPacks() });
  const packs = (packsQ.data ?? []).filter((p) => p.currency === "USD");

  const pack = useMemo(() => (packParam ? packs.find((p) => p.id === packParam) : undefined), [packs, packParam]);
  const isCustom = !pack && !!amountParam;
  const amount = pack ? Number(pack.price) : Number(amountParam ?? 0);
  const credits = pack ? Number(pack.credits) : Number(amountParam ?? 0);
  const orderLabel = pack ? pack.name : isCustom ? `Custom — ${formatUSD(amount)} in credits` : "—";

  const [method, setMethod] = useState<Method>("paystack");
  const [coin, setCoin] = useState<string>("usdttrc20");

  const initPaystack = useServerFn(initPaystackCheckout);
  const initPaystackCustom = useServerFn(initPaystackCheckoutCustom);
  const initCrypto = useServerFn(initNowPaymentsCheckout);
  const initCryptoCustom = useServerFn(initNowPaymentsCheckoutCustom);

  const pay = useMutation({
    mutationFn: async () => {
      if (!amount || amount < 1) throw new Error("Pick a pack or amount first");
      if (method === "paystack") {
        if (pack) return initPaystack({ data: { packId: pack.id } });
        return initPaystackCustom({ data: { amount } });
      }
      if (pack) {
        const r = await initCrypto({ data: { packId: pack.id, coin } });
        return { authorization_url: r.invoice_url, reference: r.reference };
      }
      const r = await initCryptoCustom({ data: { amount, coin } });
      return { authorization_url: r.invoice_url, reference: r.reference };
    },
    onSuccess: (r) => { window.location.href = r.authorization_url; },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!packsQ.isLoading && !pack && !isCustom) {
      // No selection — bounce back to billing
      navigate({ to: "/app/billing" });
    }
  }, [packsQ.isLoading, pack, isCustom, navigate]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app/billing" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Wallet className="size-6" /> Checkout</h1>
        <p className="text-sm text-muted-foreground">Choose how you'd like to pay.</p>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Order summary</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-muted-foreground">Item</div><div className="text-right font-medium">{orderLabel}</div>
          <div className="text-muted-foreground">Credits</div><div className="text-right tabular-nums">{formatUSD(credits)}</div>
          <div className="text-muted-foreground">Total</div><div className="text-right text-xl font-extrabold tabular-nums">{formatUSD(amount)}</div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Payment method</h3>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="grid sm:grid-cols-2 gap-3">
          <label className={`rounded-xl border p-4 cursor-pointer flex items-start gap-3 ${method === "paystack" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="paystack" id="m-paystack" className="mt-1" />
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2"><CreditCard className="size-4" /> Card / Bank</div>
              <p className="text-xs text-muted-foreground mt-1">Pay with card, bank transfer, or USSD via Paystack.</p>
            </div>
          </label>
          <label className={`rounded-xl border p-4 cursor-pointer flex items-start gap-3 ${method === "crypto" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="crypto" id="m-crypto" className="mt-1" />
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2"><Bitcoin className="size-4" /> Crypto</div>
              <p className="text-xs text-muted-foreground mt-1">USDT, USDC, BTC or ETH. Credits land automatically after on-chain confirmation.</p>
            </div>
          </label>
        </RadioGroup>

        {method === "crypto" && (
          <div>
            <Label>Coin</Label>
            <Select value={coin} onValueChange={setCoin}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COINS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">USDT/USDC are priced 1:1 with USD. BTC/ETH use the live exchange rate at payment time.</p>
          </div>
        )}

        <Button className="w-full" size="lg" onClick={() => pay.mutate()} disabled={pay.isPending || !amount}>
          {pay.isPending ? "Redirecting…" : `Pay ${formatUSD(amount)}`}
        </Button>
      </Card>
    </div>
  );
}
