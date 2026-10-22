import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/m/$messageId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: message } = await supabaseAdmin
          .from("messages")
          .select("id,campaign_id,campaigns!inner(media_url)")
          .eq("id", params.messageId)
          .maybeSingle();

        const mediaUrl = (message as any)?.campaigns?.media_url;
        if (!mediaUrl) return new Response("Not found", { status: 404 });

        await supabaseAdmin.from("events").insert({
          message_id: params.messageId,
          type: "clicked",
          payload: { kind: "media", campaign_id: (message as any).campaign_id },
        });

        // Serve the image ourselves instead of redirecting, so this link can
        // never forward recipients to an arbitrary website.
        let src: URL;
        try {
          src = new URL(mediaUrl);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        if (src.protocol !== "https:") return new Response("Not found", { status: 404 });
        try {
          const upstream = await fetch(src.toString(), {
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          const type = upstream.headers.get("content-type") ?? "";
          const len = Number(upstream.headers.get("content-length") ?? "0");
          if (!upstream.ok || !/^(image|video)\//i.test(type) || len > 10_000_000) {
            return new Response("Not found", { status: 404 });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=3600",
              "x-content-type-options": "nosniff",
              "content-disposition": "inline",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});