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

        void user_agent;
        // Every contact submission becomes a support ticket (auto-reply + private link).
        let ticket: { id: string; number: number };
        try {
          const { createTicket } = await import("@/lib/support-tickets.server");
          ticket = await createTicket({ email, name, subject: topic, topic, message, source: "contact" });
        } catch (error) {
          console.error("[contact] ticket create failed", error);
          return Response.json({ error: "Could not send your message" }, { status: 500 });
        }

        try {
          const [{ ADMIN_NOTIFY_EMAIL, sendAdminSms }, { sendBrandedEmail }] = await Promise.all([
            import("@/lib/admin-notify.server"),
            import("@/lib/email/send-internal.server"),
          ]);
          await Promise.all([
            sendBrandedEmail({
              templateName: "generic",
              recipientEmail: ADMIN_NOTIFY_EMAIL,
              idempotencyKey: `ticket-${ticket.id}-admin-email`,
              includeUnsubscribe: false,
              sendImmediately: true,
              templateData: {
                subject: `New ticket #${ticket.number} — ${topic}`,
                heading: `New support ticket #${ticket.number}`,
                body: [`From: ${name} <${email}>`, `Topic: ${topic}`, "", message].join("\n"),
                ctaText: "Open ticket",
                ctaUrl: `https://xellvio.com/admin/tickets/${ticket.id}`,
              },
            }).catch((e) => console.error("[contact] admin email failed", e)),
            sendAdminSms(`Xellvio: new ticket #${ticket.number} from ${name} (${email}) — ${topic}: ${message.slice(0, 200)}`).catch(() => {}),
          ]);
        } catch (e) {
          console.error("[contact] notify failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
