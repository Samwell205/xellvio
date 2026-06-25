import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/opt-in-proof/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
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
        const buf = Buffer.from(await data.arrayBuffer());
        const contentType = (data as any).type || "application/octet-stream";
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": "inline",
          },
        });
      },
    },
  },
});
