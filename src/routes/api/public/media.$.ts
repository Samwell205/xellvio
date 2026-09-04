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

        return new Response(await file.arrayBuffer(), {
          headers: {
            "content-type": asset.content_type || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
