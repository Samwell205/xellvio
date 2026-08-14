// Public, token-free delivery URL for campaign MMS images.
//
// Carriers and handset MMS gateways fetch the media URL themselves and some of
// them choke on very long signed query strings (and signed links eventually
// expire, which silently strips the image from scheduled/retried sends). This
// route serves the stored object from a short, stable, cache-friendly URL.

import { createFileRoute } from "@tanstack/react-router";

const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

async function serveCampaignMedia(params: Record<string, unknown>, headOnly = false) {
  const splat = (params as any)._splat ?? (params as any)["*"] ?? "";
  const key = String(splat).replace(/^\/+/, "").split("?")[0];
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from("campaign-media").download(key);
  if (error || !data) return new Response("Not found", { status: 404 });

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = TYPE_BY_EXT[ext] || (data as any).type || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": "inline",
  };
  if (headOnly) return new Response(null, { status: 200, headers });
  const buf = Buffer.from(await data.arrayBuffer());
  headers["Content-Length"] = String(buf.byteLength);
  return new Response(buf, { status: 200, headers });
}

export const Route = createFileRoute("/api/public/campaign-media/$")({
  server: {
    handlers: {
      HEAD: async ({ params }) => serveCampaignMedia(params, true),
      GET: async ({ params }) => serveCampaignMedia(params),
    },
  },
});
