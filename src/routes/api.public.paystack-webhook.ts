import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { creditFromPayment } from "@/lib/billing-packs.functions";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Paystack not configured", { status: 500 });

        const signature = request.headers.get("x-paystack-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha512", secret).update(body).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body);
        if (event?.event === "charge.success") {
          const reference: string = event.data?.reference;
          if (reference) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            try {
              await creditFromPayment(supabaseAdmin, reference);
            } catch (e) {
              console.error("paystack credit error", e);
              return new Response("credit error", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
