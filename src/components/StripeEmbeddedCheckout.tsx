import { useCallback, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AlertCircle } from "lucide-react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCardCreditCheckout } from "@/lib/stripe-checkout.functions";

interface Props {
  packId?: string;
  amount?: number;
  returnUrl: string;
}

export function StripeEmbeddedCheckout({ packId, amount, returnUrl }: Props) {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    try {
      const result = await createCardCreditCheckout({
        data: { packId, amount, environment: getStripeEnvironment(), returnUrl },
      });
      if ("error" in result) throw new Error(result.error);
      if (!result.clientSecret) throw new Error("Card checkout did not start");
      setError(null);
      return result.clientSecret;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Card checkout could not start";
      setError(message);
      throw e;
    }
  }, [packId, amount, returnUrl]);

  if (error) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="font-medium">Card payment could not start</p>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">
          You can also top up with crypto below, or contact support.
        </p>
      </div>
    );
  }

  return (
    <div id="checkout" className="min-h-[420px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
