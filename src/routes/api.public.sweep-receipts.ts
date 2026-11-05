import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Scheduled safety net: looks up final carrier results for dedicated-line
// messages still "sent" after 20 minutes (missed receipts). Lookup-only.
// After 24h with the network still only "sent", the text is labelled
// "no delivery report" instead of awaiting forever (never resent or recharged).
export const Route = createFileRoute("/api/public/sweep-receipts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recoverTwilioReceipts } = await import("@/lib/twilio-receipt-recovery.server");
        // Rotate through every open message with a saved cursor; without it the
        // sweep re-checked the same oldest rows forever and never reached newer ones.
        const { data: saved } = await supabaseAdmin.from("platform_settings").select("value").eq("key", "receipt_sweep_cursor").maybeSingle();
        const after = typeof saved?.value === "string" && saved.value ? saved.value : undefined;
        const result = await recoverTwilioReceipts(supabaseAdmin, { after, olderThanMin: 20, maxAgeHours: 24 * 7, limit: 240, budgetMs: 25_000, noReportAfterHours: 24 });
        const next = result.done ? "" : result.nextCursor ?? "";
        await supabaseAdmin.from("platform_settings").upsert({ key: "receipt_sweep_cursor", value: next as any }, { onConflict: "key" });
        return Response.json(result);
      },
    },
  },
});
