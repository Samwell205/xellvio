import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { startShopifyConnect } from "@/lib/shopify/oauth.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ShopifyOneClick() {
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
  const go = async () => {
    setBusy(true);
    try {
      const { url } = await start({ data: { shop } });
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">One-click Shopify connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Enter your store address and approve Xellvio in Shopify. No tokens to copy.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="yourstore.myshopify.com" />
          <Button onClick={go} disabled={busy || !shop.trim()}>{busy ? "Opening Shopify…" : "Connect Shopify"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
