/**
 * Paddle client utilities — Paddle.js initialization, environment detection,
 * and price ID resolution.
 *
 * The client token is shipped in the browser bundle via import.meta.env.
 * This is expected: the security boundary is Lovable preview auth (gates
 * access to the test token) plus the build-time token swap (puts the live
 * token into production builds).
 */

import { resolvePaddlePrice } from "@/utils/payments.functions";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle: any;
  }
}

/** Card checkout is available when a Paddle client token is present. */
export function isCardCheckoutConfigured(): boolean {
  return !!clientToken;
}

/** Single source of truth for which Paddle environment the client is in. */
export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

/** Load and initialize Paddle.js. Idempotent — safe to call multiple times. */
export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      const paddleJsEnv = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
      window.Paddle.Environment.set(paddleJsEnv);
      window.Paddle.Initialize({ token: clientToken });
      paddleInitialized = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/** Resolve a human-readable price ID (e.g. "price_starter") to a Paddle internal ID. */
export async function getPaddlePriceId(priceId: string): Promise<string> {
  const environment = getPaddleEnvironment();
  return resolvePaddlePrice({ data: { priceId, environment } });
}
