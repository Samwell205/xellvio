import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buyLocalNumber, getLocalNumberOffer, requestLocalAreaCode } from "@/lib/local-number.functions";

export function LocalNumberBuyCard() {
  const qc = useQueryClient();
  const offerFn = useServerFn(getLocalNumberOffer);
  const buyFn = useServerFn(buyLocalNumber);
  const reqFn = useServerFn(requestLocalAreaCode);
  const [areaCode, setAreaCode] = useState("");
  const { data: offer } = useQuery({ queryKey: ["local-number-offer"], queryFn: () => offerFn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["local-number-offer"] });
  const buy = useMutation({
    mutationFn: () => buyFn(),
    onSuccess: (r: any) => { toast.success(`Local number assigned: ${r.phone_number}`); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const request = useMutation({
    mutationFn: () => reqFn({ data: { area_code: areaCode } }),
    onSuccess: () => { toast.success("Area code request sent. We'll assign your number after review."); setAreaCode(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!offer) return null;
  const price = offer.price_usd;
  const low = offer.balance < price;
  const openReq = offer.requests.find((r) => r.status === "pending" || r.status === "approved");

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="size-5 text-primary" />
          Or get a verified local number — ${price.toFixed(2)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {offer.owned_number ? (
          <p className="text-sm">Your local number: <strong>{offer.owned_number}</strong></p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              A US local number that's already verified and ready to send. Paid from your credit
              balance (${offer.balance.toFixed(2)} available).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!offer.available || low || buy.isPending} onClick={() => buy.mutate()}>
                {buy.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Buy local number now
              </Button>
              {low && (
                <Button asChild variant="outline"><Link to="/app/billing">Top up credits</Link></Button>
              )}
              {!offer.available && <span className="text-xs text-muted-foreground">None ready right now — request an area code below.</span>}
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Want a specific area code?</div>
              <p className="text-xs text-muted-foreground">
                Our team reviews each request and assigns a number. The ${price.toFixed(2)} is charged
                from your credits only once the number is assigned.
              </p>
              {openReq ? (
                <Badge variant="secondary">Area code {openReq.area_code} — under review</Badge>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="e.g. 212"
                    className="w-28"
                    inputMode="numeric"
                  />
                  <Button
                    variant="outline"
                    disabled={areaCode.length !== 3 || low || request.isPending}
                    onClick={() => request.mutate()}
                  >
                    {request.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Request area code
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
