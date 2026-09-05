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
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: asset } = await supabaseAdmin
          .from("media_assets")
          .select("content_type")
          .eq("storage_path", path)
          .maybeSingle();
        if (!asset) return new Response("Not found", { status: 404 });

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
