import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

/**
 * Resolve a human-readable Paddle price ID (e.g. "price_starter") to the
 * Paddle internal price ID (e.g. "pri_01gsz...") required by Paddle.Checkout.open().
 *
 * Routed through the Lovable connector gateway — no API keys in the client.
 */
export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Paddle price lookup failed [${response.status}]: ${errorBody}`);
      throw new Error(`Price lookup failed [${response.status}]`);
    }
    const result = await response.json();
    if (!result.data?.length) throw new Error(`Price not found: ${data.priceId}`);
    return result.data[0].id as string;
  });
