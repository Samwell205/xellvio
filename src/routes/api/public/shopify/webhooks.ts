import { createFileRoute } from "@tanstack/react-router";

// Mandatory privacy webhooks (customers/data_request, customers/redact, shop/redact) + app/uninstalled.
export const Route = createFileRoute("/api/public/shopify/webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/shopify/oauth.server");
        const raw = new Uint8Array(await request.arrayBuffer());
        if (!(await m.verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256")))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const topic = request.headers.get("x-shopify-topic") ?? "";
        const shop = request.headers.get("x-shopify-shop-domain") ?? "";
        if ((topic === "shop/redact" || topic === "app/uninstalled") && m.SHOP_RE.test(shop)) {
          await m.forgetShop(shop);
        }
        // customers/data_request & customers/redact: Xellvio stores no Shopify data beyond imported contacts,
        // which the business manages (and can delete) in Contacts.
        return new Response(null, { status: 200 });
      },
    },
  },
});
