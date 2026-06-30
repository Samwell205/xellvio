import { createFileRoute } from "@tanstack/react-router";

async function serveOptInProof(params: Record<string, unknown>, headOnly = false) {
  const splat = (params as any)._splat ?? (params as any)["*"] ?? "";
  const key = String(splat).replace(/^\/+/, "");
  if (!key || key.includes("..")) {
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
    "Cache-Control": "public, max-age=31536000, immutable",
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
