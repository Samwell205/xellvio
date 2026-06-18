import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

const SYSTEM_PROMPT = `You are the friendly support assistant for Samwell Global SMS — a bulk SMS platform.
Help users with: signing up, email verification, importing contacts (CSV with email/phone/name columns), verifying sender IDs and numbers, sending SMS and campaigns, wallet/billing, API keys, and troubleshooting.
Be concise (under 6 short sentences when possible), warm, and practical. Use markdown lists when steps help.
If something requires human help (billing disputes, account recovery, sender ID approval status), tell them to use the Contact page at /contact.
Never invent prices, phone numbers, or policies you don't know — say you'll connect them with support instead.`;

export const chatWithSupportBot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Too many requests. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI service temporarily unavailable. Please contact support.");
      throw new Error(`AI error (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "Sorry, I couldn't generate a reply.";
    return { reply };
  });
