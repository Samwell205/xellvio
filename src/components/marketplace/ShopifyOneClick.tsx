import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, ShoppingBag, Users, Zap, ArrowRight, Store } from "lucide-react";
import { startShopifyConnect } from "@/lib/shopify/oauth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function cleanShop(v: string) {
  return v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function ShopifyOneClick({ connected = false, logoUrl }: { connected?: boolean; logoUrl?: string | null }) {
  const start = useServerFn(startShopifyConnect);
  const [shop, setShop] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("shopify");
    const fromShopify = p.get("shop");
    if (s === "connected") toast.success("Shopify connected");
    else if (s === "failed" || s === "invalid") toast.error("Shopify connection didn't finish. Please try again.");
    if (fromShopify && !s) setShop(fromShopify);
  }, []);
  const value = cleanShop(shop);
  const isEmail = value.includes("@");
  const error = isEmail ? "That looks like an email. Enter your store address, e.g. mystore.myshopify.com" : null;
  const go = async () => {
    if (error || !value) return;
    setBusy(true);
    try {
      const { url } = await start({ data: { shop: value } });
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  const steps = [
    { icon: Store, t: "Enter your store", d: "Type your Shopify store address." },
    { icon: ShieldCheck, t: "Approve in Shopify", d: "Shopify asks you to allow Xellvio. One click." },
    { icon: Zap, t: "Start sending", d: "Customers and orders sync so you can text them." },
  ];
  return (
    <div className="space-y-6">
      <section className="blog-reveal is-in relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="grid size-14 place-items-center rounded-2xl border bg-background shadow-sm">
                {logoUrl ? <img src={logoUrl} alt="Shopify" className="size-9 object-contain" /> : <ShoppingBag className="size-7 text-primary" />}
              </div>
              {connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><CheckCircle2 className="size-3.5" /> Connected</span>
              ) : (
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Not connected</span>
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ animation: "blog-rise .6s ease both" }}>
              Connect your Shopify store in one click
            </h1>
            <p className="max-w-xl text-muted-foreground">
              Bring your customers and orders into Xellvio and send texts when people order. No codes or tokens to copy.
            </p>
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && go()}
                  placeholder="mystore.myshopify.com"
                  className="h-12 rounded-xl text-base"
                  aria-invalid={!!error}
                />
                <Button size="lg" className="h-12 rounded-xl px-6" onClick={go} disabled={busy || !value || !!error}>
                  {busy ? "Opening Shopify…" : connected ? "Reconnect" : "Connect Shopify"} <ArrowRight className="ml-1 size-4" />
                </Button>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : (
                <p className="text-xs text-muted-foreground">Find it in Shopify under Settings → Domains (ends in .myshopify.com).</p>
              )}
            </div>
          </div>
          <div className="grid gap-3">
            {steps.map((s, i) => (
              <div key={s.t} className="flex items-start gap-4 rounded-2xl border bg-background/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md" style={{ animation: `blog-rise .6s ease ${0.1 + i * 0.12}s both` }}>
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><s.icon className="size-5" /></div>
                <div>
                  <p className="font-medium">{i + 1}. {s.t}</p>
                  <p className="text-sm text-muted-foreground">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Users, t: "Customers", d: "Names and phone numbers from your store." },
          { icon: ShoppingBag, t: "Orders", d: "Text customers about new and completed orders." },
          { icon: ShieldCheck, t: "Read-only & private", d: "We only read data. Disconnect any time." },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border bg-card p-5">
            <c.icon className="size-5 text-primary" />
            <p className="mt-3 font-medium">{c.t}</p>
            <p className="text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
