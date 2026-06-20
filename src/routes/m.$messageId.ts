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

        return Response.redirect(mediaUrl, 302);
      },
    },
  },
});