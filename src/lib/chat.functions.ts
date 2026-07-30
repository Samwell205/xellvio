import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

const SYSTEM_PROMPT = `You are the friendly support assistant for Xellvio — a bulk SMS platform.
Help users with: signing up, email verification, importing contacts (CSV with email/phone/name columns), verifying sender IDs and numbers, sending SMS and campaigns, wallet/billing, API keys, and troubleshooting.
Be concise (under 6 short sentences when possible), warm, and practical. Use markdown lists when steps help.
If something requires human help (billing disputes, account recovery, sender ID approval status), tell them to use the Contact page at /contact.
Never invent prices, phone numbers, or policies you don't know — say you'll connect them with support instead.`;

export const chatWithSupportBot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { getChatModel } = await import("./ai-provider.server");
    const { generateText } = await import("ai");

    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");

    try {
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: data.messages,
        maxOutputTokens: 700,
      });
      return { reply: text.trim() || "Sorry, I couldn't generate a reply." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|rate.?limit/i.test(message)) {
        throw new Error("Too many requests. Please try again in a moment.");
      }
      if (/402|credit|quota|billing/i.test(message)) {
        throw new Error("AI service temporarily unavailable. Please contact support.");
      }
      throw new Error(`AI error: ${message.slice(0, 200)}`);
    }
  });
