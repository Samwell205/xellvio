/**
 * Server-only helper for enqueuing branded Xellvio emails from trusted
 * server contexts (webhooks, server functions) without requiring a user JWT.
 *
 * Use this from /api/public/* webhook handlers and from .server.ts helpers.
 * Components that already have a Supabase session should call the
 * /lovable/email/transactional/send route instead.
 */
import * as React from "react";
import { render } from "@react-email/components";
import { sendLovableEmail } from "@lovable.dev/email-js";
import { TEMPLATES, type TemplateEntry } from "@/lib/email-templates/registry";

const SITE_NAME = "xellvio";
const SENDER_DOMAIN = "notify.xellvio.com";
const FROM_DOMAIN = "xellvio.com";
const FROM_ADDRESS = `Xellvio <admin@${FROM_DOMAIN}>`;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function redact(email: string): string {
  const [l, d] = email.split("@");
  if (!l || !d) return "***";
  return `${l[0]}***@${d}`;
}

export interface SendInternalArgs {
  templateName: keyof typeof TEMPLATES | string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, any>;
  includeUnsubscribe?: boolean;
  sendImmediately?: boolean;
}

function classifyEmailError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("domain_not_verified")) return "domain_not_verified";
  if (message.includes("missing_unsubscribe")) return "missing_unsubscribe";
  if (message.includes("429")) return "rate_limited";
  if (message.includes("403")) return "forbidden";
  return "send_failed";
}

export async function sendBrandedEmail(
  args: SendInternalArgs,
): Promise<{ success: boolean; reason?: string }> {
  const {
    templateName,
    recipientEmail,
    idempotencyKey,
    templateData = {},
    includeUnsubscribe = true,
    sendImmediately = false,
  } = args;

  const template: TemplateEntry | undefined = TEMPLATES[templateName as string];
  if (!template) {
    console.error("[send-internal] unknown template", { templateName });
    return { success: false, reason: "unknown_template" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const recipient = (template.to || recipientEmail || "").trim().toLowerCase();
  if (!recipient) return { success: false, reason: "no_recipient" };

  // Skip if already enqueued/sent for this idempotency key.
  const { data: existing } = await supabaseAdmin
    .from("email_send_log")
    .select("id,status")
    .eq("message_id", idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { success: true, reason: "already_enqueued" };
  }

  // Suppression check.
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", recipient)
    .maybeSingle();
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: idempotencyKey,
      template_name: templateName,
      recipient_email: recipient,
      status: "suppressed",
      error_message: "Recipient is on suppression list",
    });
    return { success: false, reason: "suppressed" };
  }

  // Mint an unsubscribe token (best effort).
  let unsubscribeToken: string | null = null;
  if (includeUnsubscribe) {
    try {
      const token = generateToken();
      const { data: row } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert({ email: recipient, token }, { onConflict: "email" })
        .select("token")
        .maybeSingle();
      unsubscribeToken = row?.token ?? token;
    } catch (err) {
      console.warn("[send-internal] could not mint unsubscribe token", err);
    }
  }

  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function"
      ? template.subject(templateData)
      : template.subject;

  await supabaseAdmin.from("email_send_log").insert({
    message_id: idempotencyKey,
    template_name: templateName,
    recipient_email: recipient,
    status: "pending",
  });

  if (sendImmediately) {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: idempotencyKey,
        template_name: templateName,
        recipient_email: recipient,
        status: "failed",
        error_message: "Email sender is not configured",
      });
      return { success: false, reason: "server_not_configured" };
    }

    try {
      await sendLovableEmail(
        {
          to: recipient,
          from: FROM_ADDRESS,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: templateName,
          idempotency_key: idempotencyKey,
          message_id: idempotencyKey,
          ...(unsubscribeToken ? { unsubscribe_token: unsubscribeToken } : {}),
        },
        { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
      );

      await supabaseAdmin.from("email_send_log").insert({
        message_id: idempotencyKey,
        template_name: templateName,
        recipient_email: recipient,
        status: "sent",
      });

      console.log("[send-internal] sent", {
        templateName,
        recipient: redact(recipient),
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[send-internal] immediate send failed", {
        templateName,
        recipient: redact(recipient),
        error: errorMessage,
      });
      await supabaseAdmin.from("email_send_log").insert({
        message_id: idempotencyKey,
        template_name: templateName,
        recipient_email: recipient,
        status: "failed",
        error_message: errorMessage.slice(0, 1000),
      });
      return { success: false, reason: classifyEmailError(error) };
    }
  }

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: idempotencyKey,
      to: recipient,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: templateName,
      idempotency_key: idempotencyKey,
      ...(unsubscribeToken ? { unsubscribe_token: unsubscribeToken } : {}),
      queued_at: new Date().toISOString(),
      site_name: SITE_NAME,
    },
  });

  if (enqueueError) {
    console.error("[send-internal] enqueue failed", {
      templateName,
      recipient: redact(recipient),
      error: enqueueError,
    });
    await supabaseAdmin.from("email_send_log").insert({
      message_id: idempotencyKey,
      template_name: templateName,
      recipient_email: recipient,
      status: "failed",
      error_message: enqueueError.message ?? "enqueue failed",
    });
    return { success: false, reason: "enqueue_failed" };
  }

  console.log("[send-internal] enqueued", {
    templateName,
    recipient: redact(recipient),
  });
  return { success: true };
}
