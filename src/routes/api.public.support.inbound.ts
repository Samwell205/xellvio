import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Inbound email replies (email service "email.received" webhook). Signed with
// the webhook secret in SUPPORT_INBOUND_WEBHOOK_SECRET; unsigned calls are rejected.
function verify(secret: string, id: string, ts: string, body: string, header: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return header.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export const Route = createFileRoute("/api/public/support/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SUPPORT_INBOUND_WEBHOOK_SECRET;
        if (!secret) return new Response("Inbound email not configured", { status: 503 });
        const raw = await request.text();
        const id = request.headers.get("svix-id") ?? "";
        const ts = request.headers.get("svix-timestamp") ?? "";
        const sig = request.headers.get("svix-signature") ?? "";
        if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 600 || !verify(secret, id, ts, raw, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }
        let evt: any;
        try { evt = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        if (evt?.type !== "email.received") return Response.json({ ignored: true });
        const d = evt.data ?? {};
        let text: string = typeof d.text === "string" ? d.text : "";
        if (!text && d.email_id && process.env.RESEND_API_KEY && process.env.LOVABLE_API_KEY) {
          const r = await fetch(`https://connector-gateway.lovable.dev/resend/emails/receiving/${encodeURIComponent(d.email_id)}`, {
            headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": process.env.RESEND_API_KEY },
          });
          if (r.ok) { const j: any = await r.json(); text = j.text || (j.html ?? "").replace(/<[^>]+>/g, " "); }
          else console.error(`[inbound] fetch failed [${r.status}]: ${await r.text()}`);
        }
        const { handleInboundEmail } = await import("@/lib/support-tickets.server");
        const res = await handleInboundEmail({
          from: String(d.from ?? ""), to: Array.isArray(d.to) ? d.to.map(String) : [String(d.to ?? "")],
          subject: String(d.subject ?? ""), text,
        });
        return Response.json(res);
      },
    },
  },
});
