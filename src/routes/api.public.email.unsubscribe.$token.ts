import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
export const Route = createFileRoute("/api/public/email/unsubscribe/$token")({ server: { handlers: {
  GET: async ({ params }) => {
    if (!z.string().uuid().safeParse(params.token).success) return new Response("Not found", { status: 404 });
    return new Response('<!doctype html><html><head><title>Unsubscribe — Xellvio</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Unsubscribe from these emails?</h1><form method="post"><button type="submit">Confirm unsubscribe</button></form></main></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  },
  POST: async ({ params }) => {
    if (!z.string().uuid().safeParse(params.token).success) return new Response("Not found", { status: 404 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db.rpc("email_unsubscribe", { _token: params.token });
    if (error) return new Response("Unable to unsubscribe. Please try again.", { status: 503 });
    return new Response('<!doctype html><html><head><title>Unsubscribed — Xellvio</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>You are unsubscribed.</h1><p>You will no longer receive marketing emails from this business.</p></main></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  },
} } });