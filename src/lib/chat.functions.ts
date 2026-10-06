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
- Payments: Billing page ([Billing](/app/billing)) — 1 USD = 1 credit, min $5, max $10,000. Card payments credit instantly after checkout. Crypto (BTC, USDT, etc.) needs at least $25 because of network minimums; below $25 pay by card. Crypto credits automatically once the blockchain confirms the payment (usually 10–60 minutes, BTC can take longer). If a crypto payment shows "finished" in the wallet but credits haven't appeared after 2 hours, or the amount sent was lower than the invoice (underpaid), it needs the team — tell them to use Talk to a human with the payment ID. Pending status means the network hasn't confirmed yet. Each message is charged per segment (160 GSM chars / 70 with emoji or special characters); failed messages are refunded automatically. Low balance pauses campaigns until they top up.
- Numbers: toll-free numbers are requested from the Toll-free verification / number request page. After payment the request goes to review; status "pending" = in review, "approved/assigned" = number is ready and shown on their account, "rejected" = see admin notes and fix the business details. Carrier verification of a toll-free number can take several business days; until verified, US messages may be blocked.
- Common errors: 40001 = number is a landline / can't receive texts (remove it). 30007 / carrier filtered = networks blocked the content as spam — rewrite: name the business, remove link shorteners/"this is not spam"/urgent/prize wording, add clear purpose. 40008 = destination route issue, not the tenant's fault (no fix needed from them; failed messages are refunded). 40002/40003/30007/40010 = blocked by carrier spam filtering — reword. 40300/21610 = recipient opted out. 40310/21211/40011 = invalid number format — use +countrycode. 40012/30003 = phone off or unreachable, retry later. 30005/40013 = number doesn't exist. 40005 = message expired in network. insufficient balance = top up. Unknown code: explain in plain words from the failure text.
- Paused campaigns: usually caused by low balance, high carrier blocking, or an account safety review after messages were flagged. Fix the cause (top up / reword the message), then resume from the campaign page. Account safety holds can only be lifted by the support team.
- Opt-outs (STOP) are permanent and are never messaged again.
- Team: Team page lets owners invite people with limited access.
- Developers: API keys on the Developer page.

How to talk:
- Talk like a friendly, real support person chatting — plain everyday words, short sentences, no jargon, no bold headings, no raw error codes or technical strings (never output things like "I/O Exception" or "800× 40008"). Explain causes in simple words, e.g. "the phone networks blocked them as spam" or "those numbers are landlines".
- Keep replies short (2–5 sentences, or a short list only when giving steps). Ask one thing at a time.
- If the question is vague or could refer to more than one thing (e.g. "my campaign failed" when they have several campaigns, or several with similar names), DO NOT guess and DO NOT dump everything. First ask which one they mean, listing their recent campaigns by name and date as short options, e.g. "Sure, I can check that. Which campaign do you mean — 'Business' from 24 Sep, 'BYENSOPTUR' from 22 Sep, or another one?" Only answer once it's clear. If they only have one campaign with failures, you can go ahead and name it back to confirm.
- When you explain a failed campaign, give the main reasons with rough numbers in plain words, say whether it's something they need to fix or not, and what to do next. Failures that are a network/route problem on the destination side are not their fault and are refunded — say that simply without technical detail.

Rules:
- Use the TENANT ACCOUNT data below (if present) to give specific answers about their campaigns, balance and holds.
- Always write links as markdown, e.g. [Billing](/app/billing).
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
    const canCost = acting.isOwner || (acting.permissions as Record<string, boolean>)?.costs === true;

    const [{ data: acct }, { data: camps }] = await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("company, credit_balance, onboarding_status, sending_suspended_at, sending_suspended_reason, telnyx_phone_number")
        .eq("id", acting.accountId)
        .maybeSingle(),
      supabaseAdmin
        .from("campaigns")
        .select("id, name, status, paused_reason, created_at")
        .eq("account_id", acting.accountId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    const campIds = (camps ?? []).map((c: any) => c.id);
    const [{ data: pays }, { data: reqs }, { data: nums }, { data: fails }] = await Promise.all([
      supabaseAdmin.from("payments").select("provider, provider_reference, amount, currency, status, created_at, paid_at")
        .eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(6),
      supabaseAdmin.from("number_requests").select("country, number_type, status, admin_notes, assigned_phone_number, created_at")
        .eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("numbers").select("phone_number, number_type, status").eq("account_id", acting.accountId).limit(10),
      campIds.length
        ? supabaseAdmin.from("messages").select("campaign_id, status, error_code, failure_reason")
            .in("campaign_id", campIds).in("status", ["failed", "undelivered"]).limit(3000)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const failBy: Record<string, Record<string, number>> = {};
    for (const m of (fails ?? []) as any[]) {
      const k = `${m.error_code ?? "?"}${m.failure_reason ? ` ${String(m.failure_reason).slice(0, 80)}` : ""}`;
      (failBy[m.campaign_id] ??= {})[k] = ((failBy[m.campaign_id] ??= {})[k] ?? 0) + 1;
    }

    const lines = [
      `Company: ${acct?.company ?? "unknown"}`,
      canCost ? `Balance: $${Number(acct?.credit_balance ?? 0).toFixed(2)}` : null,
      `Onboarding: ${acct?.onboarding_status ?? "unknown"}`,
      `Sending number: ${acct?.telnyx_phone_number ? "assigned" : "none yet"}`,
      acct?.sending_suspended_at
        ? `ACCOUNT SENDING ON HOLD (safety review): ${acct.sending_suspended_reason ?? "flagged messages"} — only the support team can lift it.`
        : "Account sending: active",
      "Recent campaigns:",
      ...(camps ?? []).map((c: any) => {
        const f = failBy[c.id];
        const fs = f ? ` | failures: ${Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n}× ${k}`).join("; ")}` : "";
        return `- "${c.name}" (${new Date(c.created_at).toISOString().slice(0, 10)}) — ${c.status}${c.paused_reason ? ` (paused: ${c.paused_reason})` : ""}${fs}`;
      }),
      "Payments:",
      ...((pays ?? []) as any[]).map((p) => `- ${p.created_at.slice(0, 10)} ${p.provider} ${canCost ? `${p.amount} ${p.currency}` : ""} — ${p.status}${p.provider_reference ? ` (ref ${p.provider_reference})` : ""}`),
      "Number requests:",
      ...((reqs ?? []) as any[]).map((r) => `- ${r.created_at.slice(0, 10)} ${r.country} ${r.number_type} — ${r.status}${r.assigned_phone_number ? ` → ${r.assigned_phone_number}` : ""}${r.admin_notes ? ` (note: ${String(r.admin_notes).slice(0, 150)})` : ""}`),
      "Numbers on account:",
      ...((nums ?? []) as any[]).map((n) => `- ${n.phone_number} ${n.number_type} ${n.status}`),
    ].filter(Boolean);
    return lines.join("\n");
  } catch (e) {
    console.error("[chat] context failed", e);
    return null;
  }
}

/** Returns the SMS draft when the user asks for a review, else null. */
export function extractDraft(text: string): string | null {
  const t = text.trim();
  const quoted = t.match(/["“'`]{1,3}([\s\S]{15,1600}?)["”'`]{1,3}/)?.[1];
  const asks = /\b(review|check|is (this|it) (ok|okay|allowed|fine)|can i send|allowed|approve|permitted|will (this|it) (pass|get blocked))\b/i.test(t);
  if (quoted && asks) return quoted.trim();
  if (asks) {
    const after = t.split(/[:\n]/).slice(1).join("\n").trim();
    if (after.length >= 15) return after.slice(0, 1600);
  }
  return null;
}

export const chatWithSupportBot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getChatModel } = await import("./ai-provider.server");
    const { generateText } = await import("ai");

    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");

    const ctx = await loadTenantContext();
    let system = ctx
      ? `${SYSTEM_PROMPT}\n\nTENANT ACCOUNT (signed in):\n${ctx}`
      : `${SYSTEM_PROMPT}\n\nThe visitor is not signed in.`;

    // Message review: screen a pasted draft with the same checks campaigns use.
    const last = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const draft = extractDraft(last);
    if (draft) {
      try {
        const { keywordScan } = await import("./content-scanner");
        const { aiScan } = await import("./ai-content-scan.server");
        let r = keywordScan(draft);
        if (r.allowed && r.confidence !== "keyword") r = await aiScan(draft);
        const verdict = !r.allowed
          ? `BLOCKED — ${r.category ? r.category.replace(/_/g, " ") : "prohibited content"}: ${r.reason ?? ""}`
          : r.confidence === "keyword"
            ? `ALLOWED WITH WARNING — ${r.reason ?? "wording may be flagged"}`
            : (r as { reason?: string }).reason?.includes("unavailable")
              ? "CHECK UNAVAILABLE — review manually against the guidance"
              : "ALLOWED by content screening";
        const hasStop = /\bstop\b/i.test(draft);
        system += `\n\nMESSAGE REVIEW REQUEST. The user wants this draft checked:\n"""${draft}"""\nScreening result: ${verdict}\nContains opt-out (STOP) wording: ${hasStop ? "yes" : "no"}. Length: ${draft.length} chars.\nReply as a review: say plainly if it can be sent, why or why not, list any fixes (name the business, add "Reply STOP to unsubscribe", avoid link shorteners/urgent/prize/"not spam" wording), and offer an improved rewrite in a short block. If BLOCKED, say this type of content isn't allowed on the platform and don't offer a rewrite that keeps the same product. Never mention internal tools or vendors.`;
      } catch (e) {
        console.error("[chat] review failed", e);
      }
    }

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
