import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (q: string) => Response.redirect(`${url.origin}/app/apps/shopify?${q}`, 302);
        try {
          const m = await import("@/lib/shopify/oauth.server");
          const p = url.searchParams;
          const shop = p.get("shop") ?? "";
          if (!m.SHOP_RE.test(shop) || !(await m.verifyQueryHmac(p))) return back("shopify=invalid");
          const state = await m.readState(p.get("state") ?? "");
          if (state.s !== shop) return back("shopify=invalid");
          const tok = await m.exchangeCode(shop, p.get("code") ?? "");
          await m.saveShopifyConnection(state.u, shop, tok.accessToken, tok.scopes);
          return back("shopify=connected");
        } catch (e) {
          console.error("shopify callback", e);
          return back("shopify=failed");
        }
      },
    },
  },
});
