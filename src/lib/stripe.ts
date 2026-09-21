import { loadStripe, Stripe } from "@stripe/stripe-js";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!isCardCheckoutConfigured()) {
      throw new Error("Card payments are not configured for this build.");
    }
    stripePromise = loadStripe(publishableKey as string);
  }
  return stripePromise;
}

export function isCardCheckoutConfigured(): boolean {
  return (
    !!publishableKey &&
    (publishableKey.startsWith("pk_live_") || publishableKey.startsWith("pk_test_"))
  );
}

export function isCardTestMode(): boolean {
  return !!publishableKey?.startsWith("pk_test_");
}
