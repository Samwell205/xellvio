import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  topic: z.string().trim().min(2).max(80),
  message: z.string().trim().min(10).max(2000),
  user_agent: z.string().max(500).nullish(),
});

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: "Please check the form" }, { status: 400 });
        }
        const { name, email, topic, message, user_agent } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("contact_messages")
          .insert({ name, email, topic, message, user_agent: user_agent ?? null })
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("[contact] insert failed", error);
          return Response.json({ error: "Could not send your message" }, { status: 500 });
        }

        const key = `contact-${row?.id ?? Date.now()}`;
        const subject = `New contact message — ${topic}`;
        const lines = [
          `From: ${name} <${email}>`,
          `Topic: ${topic}`,
          "",
          message,
        ];

        try {
          const [{ ADMIN_NOTIFY_EMAIL, sendAdminSms }, { sendAdminPush }, { sendBrandedEmail }] =
            await Promise.all([
              import("@/lib/admin-notify.server"),
              import("@/lib/admin-push.server"),
              import("@/lib/email/send-internal.server"),
            ]);

          await Promise.all([
            sendBrandedEmail({
              templateName: "generic",
              recipientEmail: ADMIN_NOTIFY_EMAIL,
              idempotencyKey: `${key}-admin-email`,
              includeUnsubscribe: false,
              sendImmediately: true,
              templateData: {
                subject,
                heading: "New contact message",
                body: lines.join("\n"),
                ctaText: "Open contact inbox",
                ctaUrl: "https://xellvio.com/admin/messages",
              },
            }).catch((e) => console.error("[contact] admin email failed", e)),
            sendAdminPush({
              title: `New message — ${topic}`,
              body: `${name}: ${message.slice(0, 120)}`,
              url: "/admin/messages",
              tag: key,
            }).catch(() => {}),
            sendAdminSms(
              `Xellvio: new contact message from ${name} (${email}) — ${topic}: ${message.slice(0, 200)}`,
            ).catch(() => {}),
          ]);
        } catch (e) {
          console.error("[contact] notify failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
