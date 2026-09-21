import { getPaddleEnvironment } from "@/lib/paddle";

/**
 * Test-mode banner for Paddle checkout. Renders nothing with a live token
 * — safe to include unconditionally.
 */
export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="w-full rounded-lg border border-orange-300/40 bg-orange-100/50 px-4 py-2 text-center text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
      Card payments are in test mode — no real money is charged.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Read more
      </a>
    </div>
  );
}
