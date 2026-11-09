import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTfnMarketplaceOffer, purchaseTfnFromMarketplace } from "@/lib/tfn-marketplace.functions";
import { getMyDedicatedLine } from "@/lib/twilio-lines.functions";

/** Lets a tenant buy an already-verified toll-free number from credit; hidden once they have a line. */
export function BuyReadyNumberCard() {
  const qc = useQueryClient();
  const offerFn = useServerFn(getTfnMarketplaceOffer);
  const lineFn = useServerFn(getMyDedicatedLine);
  const buyFn = useServerFn(purchaseTfnFromMarketplace);
  const { data: offer } = useQuery({ queryKey: ["tfn-marketplace-offer"], queryFn: () => offerFn(), refetchInterval: 60_000 });
  const { data: lineData } = useQuery({ queryKey: ["dedicated-line"], queryFn: () => lineFn(), staleTime: 30_000 });
  const buy = useMutation({
    mutationFn: () => buyFn(),
    onSuccess: (r: any) => {
      toast.success(r?.phone_number ? `Your number is ready: ${r.phone_number}` : "Your verified number is ready.");
      ["tfn-marketplace-offer", "dedicated-line", "tollfree-verification", "tollfree-fee-status"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: any) => toast.error(e?.message ?? "Purchase failed"),
  });

  const line = lineData?.line as any;
  if (!offer || (line?.phone_number && line.status !== "released")) return null;
  const count = Number(offer.available_count ?? 0);
  const price = Number(offer.price_usd ?? 0);

  return (
    <Card className="p-6 space-y-4 rounded-3xl border-primary/40">
      <div>
        <div className="font-semibold flex items-center gap-2"><BadgeCheck className="size-4 text-primary" /> Buy a ready, verified toll-free number</div>
        <p className="text-sm text-muted-foreground mt-1">Already approved by carriers — start texting US & Canada right away. No forms and no waiting. Paid from your credit.</p>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div><div className="text-xs text-muted-foreground">Price</div><div className="font-semibold">${price.toFixed(2)}</div></div>
        <div><div className="text-xs text-muted-foreground">Available now</div><div className="font-semibold">{count}</div></div>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline"><Link to="/app/billing">Add credit</Link></Button>
          <Button disabled={count <= 0 || buy.isPending} onClick={() => { if (confirm(`Buy a verified toll-free number for $${price.toFixed(2)} from your credit?`)) buy.mutate(); }}>
            {buy.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            {count > 0 ? "Buy now" : "Sold out"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
