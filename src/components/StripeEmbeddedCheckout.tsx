import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCardCreditCheckout } from "@/lib/stripe-checkout.functions";

interface Props {
  packId?: string;
  amount?: number;
  returnUrl: string;
}

export function StripeEmbeddedCheckout({ packId, amount, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCardCreditCheckout({
      data: { packId, amount, environment: getStripeEnvironment(), returnUrl },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Card checkout did not start");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="min-h-[420px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
