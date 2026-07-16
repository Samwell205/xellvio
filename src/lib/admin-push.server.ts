// Server-only helper to send Web Push notifications to all subscribed admins.
// Failures are swallowed per-endpoint; expired/invalid endpoints are pruned.

export interface AdminPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendAdminPush(payload: AdminPushPayload): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@xellvio.com";
  if (!pub || !priv) {
    console.warn("[admin-push] VAPID keys not configured; skipping");
    return;
  }

  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, pub, priv);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/admin",
      tag: payload.tag,
    });

    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 * 24 },
          );
          await supabaseAdmin
            .from("admin_push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", s.id);
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            await supabaseAdmin.from("admin_push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("[admin-push] send failed", status, err?.body ?? err?.message);
          }
        }
      }),
    );
  } catch (e) {
    console.error("[admin-push] unexpected", e);
  }
}
