import { createFileRoute } from "@tanstack/react-router";
import { reconcileOneNowPayment } from "@/lib/nowpayments.functions";

/**
 * Sweep pending NOWPayments invoices and reconcile against the NOWPayments API.
 * Runs as a safety net for missed/failed IPN webhooks (common with ETH/BTC
 * confirmations that arrive late).
 *
 * Auth: pass header `x-poll-secret: <NOWPAYMENTS_POLL_SECRET>`. If the secret
 * env var is not set the endpoint is disabled (returns 503) so it can never be
 * an open write endpoint.
 *
 * Call it from a cron job, e.g. every 2 minutes.
 */
export const Route = createFileRoute("/api/public/nowpayments-poll")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const secret = process.env.NOWPAYMENTS_POLL_SECRET;
  if (!secret) return new Response("Poll disabled", { status: 503 });
  const provided = request.headers.get("x-poll-secret") ?? new URL(request.url).searchParams.get("secret");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Only touch payments that had time to confirm on-chain (>2 min) and aren't ancient
  const cutoffMin = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const cutoffMax = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from("payments")
    .select("id,account_id,status,credits,amount,currency,metadata,provider,provider_reference,created_at")
    .eq("provider", "nowpayments")
    .eq("status", "pending")
    .lte("created_at", cutoffMin)
    .gte("created_at", cutoffMax)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return new Response(error.message, { status: 500 });

  const results: Array<{ id: string; ref: string | null; status: string; error?: string }> = [];
  for (const p of pending ?? []) {
    try {
      const r = await reconcileOneNowPayment(p as any);
      results.push({ id: p.id, ref: p.provider_reference, status: r.status });
    } catch (e: any) {
      results.push({ id: p.id, ref: p.provider_reference, status: "error", error: e?.message ?? String(e) });
    }
  }
  return new Response(JSON.stringify({ checked: pending?.length ?? 0, results }), {
    headers: { "content-type": "application/json" },
  });
}
