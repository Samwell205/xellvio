import { createFileRoute } from "@tanstack/react-router";

async function serveOptInProof(params: Record<string, unknown>, headOnly = false) {
  const splat = (params as any)._splat ?? (params as any)["*"] ?? "";
  const key = String(splat).replace(/^\/+/, "");
  // Only exact upload-generated keys (owner id + time + random part) are served;
  // the unguessable key is the link carriers use to review the evidence.
  const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{12,14}-(?:[a-z0-9]{6}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:png|jpg|webp|gif|pdf)$/;
  if (!key || !KEY_RE.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("opt-in-assets")
    .download(key);
  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }
  const contentType = (data as any).type || "application/octet-stream";
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "X-Robots-Tag": "noindex",
    "Content-Disposition": "inline",
  };
  if (headOnly) {
    return new Response(null, { status: 200, headers });
  }
  const buf = Buffer.from(await data.arrayBuffer());
  return new Response(buf, { status: 200, headers });
}

export const Route = createFileRoute("/api/public/opt-in-proof/$")({
  server: {
    handlers: {
      HEAD: async ({ params }) => serveOptInProof(params, true),
      GET: async ({ params }) => serveOptInProof(params),
    },
  },
});
