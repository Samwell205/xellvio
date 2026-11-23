/**
 * Serves a tenant's uploaded media to visitors of their published pages.
 * The storage bucket stays private; only files recorded in media_assets are
 * streamed, and the unguessable UUID path is the capability.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as Record<string, string>)._splat ?? "").replace(/^\/+/, "");
        // Only "<business-id>/<random-id>.<ext>" library paths are servable.
        const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
        if (!new RegExp(`^${UUID}/(?:blog/)?${UUID}\\.[a-z0-9]{1,6}$`, "i").test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: asset } = await supabaseAdmin
          .from("media_assets")
          .select("content_type, account_id")
          .eq("storage_path", path)
          .limit(1)
          .maybeSingle();
        // The file must sit in the folder of the business that owns the record,
        // so a record pointed at another business's file can never serve it.
        if (!asset || !asset.account_id || !path.startsWith(`${asset.account_id}/`)) {
          return new Response("Not found", { status: 404 });
        }

        const { data: file, error } = await supabaseAdmin.storage.from("tenant-media").download(path);
        if (error || !file) return new Response("Not found", { status: 404 });

        // SVG (and anything not a known-safe raster/video type) can carry
        // script that would run on our own origin, so it is never rendered
        // inline: it is forced to download instead.
        const type = asset.content_type || "application/octet-stream";
        const inlineSafe = /^(image\/(png|jpeg|jpg|gif|webp|avif)|video\/(mp4|webm|quicktime))$/i.test(type);
        return new Response(await file.arrayBuffer(), {
          headers: {
            "content-type": inlineSafe ? type : "application/octet-stream",
            "content-disposition": inlineSafe ? "inline" : "attachment",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });

      },
    },
  },
});
