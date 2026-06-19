// Server-only admin notification helpers.
// Sends SMS via the master Twilio account using the workspace MessagingServiceSid.

export const ADMIN_NOTIFY_PHONE = "+2347056089052";
export const ADMIN_NOTIFY_EMAIL = "sam@samwellagency.com";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export async function sendAdminSms(body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !msSid) {
    console.warn("[admin-notify] Twilio env not configured; skipping SMS");
    return;
  }
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({
    To: ADMIN_NOTIFY_PHONE,
    MessagingServiceSid: msSid,
    Body: body.slice(0, 1500),
  });
  const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[admin-notify] Twilio SMS failed", res.status, text);
  }
}
