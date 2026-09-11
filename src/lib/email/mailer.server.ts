/**
 * Provider-agnostic email sender.
 *
 * Uses Resend when RESEND_API_KEY is present (self-hosted setup), and falls
 * back to the managed Lovable sender otherwise, so the same code works in the
 * Lovable preview and on Cloudflare Workers.
 */
import { sendLovableEmail } from "@lovable.dev/email-js";

export interface MailPayload {
  to: string;
  from: string;
  sender_domain: string;
  subject: string;
  html: string;
  text?: string;
  purpose?: string;
  label?: string;
  idempotency_key?: string;
  message_id?: string;
  unsubscribe_token?: string | null;
  run_id?: string;
}

export function mailerProvider(): "resend" | "lovable" | "none" {
  if (process.env.RESEND_API_KEY && process.env.LOVABLE_API_KEY) return "resend";
  if (process.env.LOVABLE_API_KEY) return "lovable";
  return "none";
}


function siteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://xellvio.com"
  );
}

function unsubscribeUrl(token: string): string {
  return `${siteUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

const FOOTER_MARK = "data-xellvio-unsub";

function withUnsubscribeFooter(html: string, url: string): string {
  if (html.includes(FOOTER_MARK)) return html;
  const footer = `<div ${FOOTER_MARK}="1" style="margin:24px 0 8px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#8b8b8b;">You are receiving this email because of activity on your Xellvio account. <a href="${url}" style="color:#8b8b8b;text-decoration:underline;">Unsubscribe</a></div>`;
  if (html.includes("</body>")) return html.replace("</body>", `${footer}</body>`);
  return html + footer;
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export async function sendMail(payload: MailPayload): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;

  if (resendKey && lovableKey) {
    const token = payload.unsubscribe_token || undefined;
    const url = token ? unsubscribeUrl(token) : undefined;
    const headers: Record<string, string> = {};
    if (payload.message_id) headers["X-Entity-Ref-ID"] = payload.message_id;
    if (url) {
      headers["List-Unsubscribe"] = `<${url}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    };
    if (payload.idempotency_key) {
      requestHeaders["Idempotency-Key"] = payload.idempotency_key.slice(0, 256);
    }

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: url ? withUnsubscribeFooter(payload.html, url) : payload.html,
        ...(payload.text ? { text: payload.text } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(payload.label
          ? {
              tags: [
                {
                  name: "label",
                  value: payload.label.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60),
                },
              ],
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Resend send failed [${response.status}]: ${errorBody}`);
      const err = new Error(`resend_send_failed [${response.status}]: ${errorBody}`) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }
    return;
  }


  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Email sender is not configured");

  await sendLovableEmail(
    {
      run_id: payload.run_id,
      to: payload.to,
      from: payload.from,
      sender_domain: payload.sender_domain,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      purpose: payload.purpose,
      label: payload.label,
      idempotency_key: payload.idempotency_key,
      unsubscribe_token: payload.unsubscribe_token ?? undefined,
      message_id: payload.message_id,
    } as any,
    { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
  );
}
