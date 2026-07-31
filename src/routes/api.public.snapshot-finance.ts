import { createFileRoute } from "@tanstack/react-router";

// Scheduled poll — freezes the current admin finance summary plus the live
// carrier balance into finance_snapshots, for trend/audit purposes. Called by
// the `snapshot-finance-metrics` pg_cron job (see supabase/migrations).
export const Route = createFileRoute("/api/public/snapshot-finance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const [{ data: summary, error }, balanceResult] = await Promise.all([
          admin.rpc("admin_finance_summary"),
          (async () => {
            try {
              const { getBalance } = await import("@/lib/telnyx.server");
              return await getBalance();
            } catch (e: any) {
              return { ok: false, balance: 0, currency: "USD", error: e?.message ?? String(e) };
            }
          })(),
        ]);
        if (error) return new Response(error.message, { status: 500 });

        const { error: insertError } = await admin.from("finance_snapshots").insert({
          snapshot: summary,
          carrier_balance: balanceResult.ok ? balanceResult.balance : null,
          carrier_balance_currency: balanceResult.currency ?? "USD",
        });
        if (insertError) return new Response(insertError.message, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
