import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

const SYSTEM_PROMPT = `You are the support assistant for Xellvio — a bulk SMS marketing platform. Your job is to fully solve the tenant's problem yourself so they never need to wait for a human.

What you know about the platform:
- Sign up at /auth, verify email via the link sent to their inbox (check spam). Password reset at /forgot-password.
- Contacts: Audience → Import CSV (columns: phone, first_name, last_name, email). Phones should be in international format (+1...). Lists and Segments group contacts.
- Campaigns: Campaigns → New campaign → pick audience, sender, write message, optional image (images deliver as pictures to US/Canada; other countries receive a link), send now or schedule. Every message must identify the business and include "Reply STOP to unsubscribe".
- Senders: US traffic needs a verified toll-free number (Toll-free verification page) or 10DLC registration. Verification is reviewed by carriers and can take several business days.
- Billing: Billing page to add funds (card or crypto). Each message is charged per segment (160 GSM chars / 70 with emoji). Low balance pauses campaigns.
- Common errors: 40001 = number is a landline / can't receive texts (remove it). 30007 / carrier filtered = networks blocked the content as spam — rewrite: name the business, remove link shorteners/"this is not spam"/urgent/prize wording, add clear purpose. 40008 = destination route issue, not the tenant's fault.
- Paused campaigns: usually caused by low balance, high carrier blocking, or an account safety review after messages were flagged. Fix the cause (top up / reword the message), then resume from the campaign page. Account safety holds can only be lifted by the support team.
- Opt-outs (STOP) are permanent and are never messaged again.
- Team: Team page lets owners invite people with limited access.
- Developers: API keys on the Developer page.

Rules:
- Use the TENANT ACCOUNT data below (if present) to give specific answers about their campaigns, balance and holds.
- Be concise, warm and practical. Use short markdown lists for steps. Always write links as markdown, e.g. [Billing](/app/billing).
- Never invent prices, phone numbers, emails or policies. Never mention internal providers or vendors.
- If the issue truly needs a human (refunds, billing disputes, account recovery, lifting an account safety hold, verification status you can't see, anything you can't resolve), say: "Tap **Talk to a human** below this chat and send us your message — it goes straight to our team's email and we'll reply to you by email." You can also offer the [Contact page](/contact).`;

async function loadTenantContext(): Promise<string | null> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.getUser(token);
    if (!u?.user) return null;
    const { resolveActingAccount } = await import("./acting-account.server");
    const acting = await resolveActingAccount(u.user.id);
    const canCost = acting.permissions?.["view_costs" as keyof typeof acting.permissions] !== false;

    const [{ data: acct }, { data: camps }] = await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("company, credit_balance, onboarding_status, sending_suspended_at, sending_suspended_reason, telnyx_phone_number")
        .eq("id", acting.accountId)
        .maybeSingle(),
      supabaseAdmin
        .from("campaigns")
        .select("name, status, paused_reason, created_at")
        .eq("account_id", acting.accountId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const lines = [
      `Company: ${acct?.company ?? "unknown"}`,
      canCost ? `Balance: $${Number(acct?.credit_balance ?? 0).toFixed(2)}` : null,
      `Onboarding: ${acct?.onboarding_status ?? "unknown"}`,
      `Sending number: ${acct?.telnyx_phone_number ? "assigned" : "none yet"}`,
      acct?.sending_suspended_at
        ? `ACCOUNT SENDING ON HOLD (safety review): ${acct.sending_suspended_reason ?? "flagged messages"} — only the support team can lift it.`
        : "Account sending: active",
      "Recent campaigns:",
      ...(camps ?? []).map(
        (c) => `- "${c.name}" — ${c.status}${c.paused_reason ? ` (paused: ${c.paused_reason})` : ""}`,
      ),
    ].filter(Boolean);
    return lines.join("\n");
  } catch (e) {
    console.error("[chat] context failed", e);
    return null;
  }
}

export const chatWithSupportBot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getChatModel } = await import("./ai-provider.server");
    const { generateText } = await import("ai");

    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");

    const ctx = await loadTenantContext();
    const system = ctx
      ? `${SYSTEM_PROMPT}\n\nTENANT ACCOUNT (signed in):\n${ctx}`
      : `${SYSTEM_PROMPT}\n\nThe visitor is not signed in.`;

    try {
      const { text } = await generateText({
        model,
        system,
        messages: data.messages,
        maxOutputTokens: 900,
      });
      return { reply: text.trim() || "Sorry, I couldn't generate a reply." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|rate.?limit/i.test(message)) {
        throw new Error("Too many requests. Please try again in a moment.");
      }
      if (/402|credit|quota|billing/i.test(message)) {
        throw new Error("AI service temporarily unavailable. Please tap Talk to a human.");
      }
      throw new Error("The assistant had a problem. Please tap Talk to a human.");
    }
  });
