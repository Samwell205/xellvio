import { isCardCheckoutConfigured, isCardTestMode } from "@/lib/stripe";

export function PaymentTestModeBanner() {
  if (!isCardCheckoutConfigured()) {
    return (
      <div className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Card checkout isn't configured yet.
      </div>
    );
  }
  if (isCardTestMode()) {
    return (
      <div className="w-full rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning-foreground">
        Card payments are in test mode — no real money is charged.
      </div>
    );
  }
  return null;
}
