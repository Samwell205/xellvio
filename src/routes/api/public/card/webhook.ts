import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { settleCardPayment } from "@/lib/card-settle.server";

function hashOk(got: string | null): boolean {
  const expected = process.env["FLUTTERWAVE_SECRET_HASH"];
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/card/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hashOk(request.headers.get("verif-hash"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const body = (await request.json()) as any;
          const ref: unknown = body?.data?.tx_ref ?? body?.txRef ?? body?.tx_ref;
          if (typeof ref === "string" && ref.startsWith("icp_") && ref.length < 80) {
            // Never trust the payload: settle re-checks with the processor.
            await settleCardPayment(ref);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("card webhook error", e);
          return Response.json({ received: true });
        }
      },
    },
  },
});
