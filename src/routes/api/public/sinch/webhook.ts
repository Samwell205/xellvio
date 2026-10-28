// Delivery receipts from the UK SMS route. Signature-verified, then converted
// to the primary route's receipt shape so the same status, spam-gate and
// tenant-webhook logic applies.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Report = z.object({
  message_delivery_report: z.object({
    message_id: z.string().min(1).max(64),
    status: z.string().max(40),
    reason: z.object({ code: z.string().optional(), description: z.string().optional(), sub_code: z.string().optional() }).partial().optional(),
  }),
}).passthrough();

export const Route = createFileRoute("/api/public/sinch/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifySinchSignature } = await import("@/lib/sinch.server");
        if (!verifySinchSignature(raw, request.headers)) return new Response("Invalid signature", { status: 401 });
        let json: unknown;
        try { json = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const parsed = Report.safeParse(json);
        if (!parsed.success) return new Response("ok"); // other trigger types are ignored
        const r = parsed.data.message_delivery_report;
        const { mapSinchStatus } = await import("@/lib/sinch-routing");
        const status = mapSinchStatus(r.status);
        const errors = status === "delivery_failed"
          ? [{ code: r.reason?.code ?? "SINCH_FAILED", detail: r.reason?.description ?? "Recipient network did not deliver the message." }]
          : [];
        const payload = {
          data: {
            event_type: status === "sent" ? "message.sent" : "message.finalized",
            payload: { id: r.message_id, to: [{ status, errors }] },
          },
        };
        const { handleStatus } = await import("@/routes/api.public.telnyx-status");
        await handleStatus(payload);
        return new Response("ok");
      },
    },
  },
});
