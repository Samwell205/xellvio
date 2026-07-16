import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// NOWPayments IPN signature: HMAC-SHA512 of the JSON body with KEYS SORTED ALPHABETICALLY
// using the IPN secret. Header: x-nowpayments-sig
function sortedStringify(obj: any): string {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
}

export const Route = createFileRoute("/api/public/nowpayments-ipn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!secret) return new Response("IPN secret not configured", { status: 500 });

        const signature = request.headers.get("x-nowpayments-sig") ?? "";
        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

        const expected = createHmac("sha512", secret).update(sortedStringify(payload)).digest("hex");
        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expected, "hex");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const status = String(payload.payment_status ?? "").toLowerCase();
        const orderId = String(payload.order_id ?? "");
        const txHash = (payload.outcome?.hash ?? payload.payin_hash ?? payload.pay_hash ?? null) as string | null;
        if (!orderId) return new Response("Missing order_id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id,account_id,status,credits,amount,currency,metadata")
          .eq("provider_reference", orderId)
          .maybeSingle();
        if (!payment) return new Response("Unknown order", { status: 404 });

        // Always record latest IPN snapshot for auditing
        const meta = { ...(payment.metadata as any), last_ipn: payload, tx_hash: txHash };

        if (status === "finished" || status === "confirmed") {
          // Auto-credit if tx hash is unique (or absent — still safe via payment.status check)
          if (txHash) {
            const { data: dupe } = await supabaseAdmin
              .from("payments")
              .select("id")
              .neq("id", payment.id)
              .eq("status", "paid")
              .contains("metadata", { tx_hash: txHash })
              .maybeSingle();
            if (dupe) {
              await supabaseAdmin
                .from("payments")
                .update({ status: "failed", admin_note: `Duplicate tx hash ${txHash}`, metadata: meta })
                .eq("id", payment.id);
              return new Response("Duplicate tx hash", { status: 200 });
            }
          }
          if (payment.status !== "paid") {
            await supabaseAdmin.rpc("topup_account", {
              _account_id: payment.account_id,
              _amount: payment.credits,
              _description: `NOWPayments ${payment.currency} ${payment.amount} — ${orderId}`,
            });
            await supabaseAdmin
              .from("payments")
              .update({ status: "paid", paid_at: new Date().toISOString(), metadata: meta })
              .eq("id", payment.id);
            try {
              const { notifyCryptoPaymentCredited } = await import("@/lib/nowpayments.functions");
              await notifyCryptoPaymentCredited({ ...payment, metadata: meta });
            } catch (e) {
              console.error("[np-ipn] notify failed", e);
            }
          }
        } else if (status === "failed" || status === "expired" || status === "refunded") {
          await supabaseAdmin
            .from("payments")
            .update({ status: status === "refunded" ? "refunded" : "failed", admin_note: `NOWPayments ${status}`, metadata: meta })
            .eq("id", payment.id);
        } else {
          // partially_paid / waiting / sending / confirming — just snapshot
          await supabaseAdmin.from("payments").update({ metadata: meta }).eq("id", payment.id);
        }

        return new Response("ok");
      },
    },
  },
});
