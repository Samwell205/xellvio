// Delivery receipts from the international SMS route. The URL token is
// verified, then each report is converted to the primary route's receipt shape
// so the same status, spam-gate and tenant-webhook logic applies.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Status = z.object({
  id: z.number().optional(),
  groupName: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
}).partial();

const Report = z.object({
  messageId: z.string().min(1).max(80),
  status: Status.optional(),
  to: z.string().optional(),
}).passthrough();

const Body = z.object({
  reports: z.array(Report).optional(),
  results: z.array(Report).optional(),
}).passthrough();

export const Route = createFileRoute("/api/public/infobip/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyInfobipWebhookToken } = await import("@/lib/infobip.server");
        if (!verifyInfobipWebhookToken(new URL(request.url).searchParams.get("token"))) {
          return new Response("Invalid token", { status: 401 });
        }
        const raw = await request.text();
        let json: unknown;
        try { json = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return new Response("ok"); // unknown payloads are ignored
        const reports = [...(parsed.data.reports ?? []), ...(parsed.data.results ?? [])];
        if (!reports.length) return new Response("ok");
        const { mapInfobipStatus } = await import("@/lib/infobip-routing");
        for (const r of reports) {
          const status = mapInfobipStatus(r.status?.groupName, r.status?.name);
          const errors = status === "delivery_failed"
            ? [{
                code: r.status?.id != null ? `IB_${r.status.id}` : "IB_FAILED",
                detail: r.status?.description ?? "Recipient network did not deliver the message.",
              }]
            : [];
          const payload = {
            data: {
              event_type: status === "sent" ? "message.sent" : "message.finalized",
              payload: { id: r.messageId, to: [{ status, errors }] },
            },
          };
          const { handleStatus } = await import("@/routes/api.public.telnyx-status");
          await handleStatus(payload);
        }
        return new Response("ok");
      },
    },
  },
});
