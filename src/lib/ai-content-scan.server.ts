import { z } from "zod";
import { getChatModel } from "./ai-provider.server";
import { generateText } from "ai";
import type { ScanResult } from "./content-scanner";

const AI_SCHEMA = z.object({
  allowed: z.boolean(),
  category: z
    .enum([
      "sexual",
      "hate_speech",
      "alcohol",
      "firearms",
      "tobacco",
      "cannabis_cbd",
      "illegal_drugs",
      "gambling",
      "payday_loans",
      "debt_collection",
      "crypto_scam",
      "get_rich_quick",
      "fraud_deceptive",
      "phishing",
      "none",
    ])
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  reason: z.string().optional(),
});

export async function aiScan(messageBody: string): Promise<ScanResult> {
  const model = await getChatModel();
  if (!model) {
    console.warn("[content-scanner] no AI provider configured; skipping AI scan");
    return { allowed: true, confidence: "none" };
  }

  try {
    // Build the JSON schema description inline so the model returns parseable
    // output even when the provider does not support native structured outputs.
    const jsonSchemaDescription = JSON.stringify({
      type: "object",
      properties: {
        allowed: { type: "boolean" },
        category: {
          type: "string",
          enum: [
            "sexual", "hate_speech", "alcohol", "firearms", "tobacco",
            "cannabis_cbd", "illegal_drugs", "gambling", "payday_loans",
            "debt_collection", "crypto_scam", "get_rich_quick",
            "fraud_deceptive", "phishing", "none",
          ],
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        reason: { type: "string" },
      },
      required: ["allowed"],
    });

    const { text } = await generateText({
      model,
      // Content screening already fails open on any error — retrying buys
      // nothing (a persistent error like an exhausted billing balance fails
      // identically every time) and risks blowing the Cloudflare Worker's
      // CPU budget on retry overhead, which is exactly what happened here.
      maxRetries: 0,
      timeout: 8000,
      system:
        "You are a content safety classifier for an SMS marketing platform that must comply with US/CA carrier (SHAFT) policies and Twilio's Acceptable Use Policy. " +
        "Block messages promoting any of these categories:\n" +
        "- tobacco: cigarettes, cigars, vaping, e-cigs, nicotine products, hookah\n" +
        "- alcohol: promotional alcohol sales/delivery, bar specials targeting consumers\n" +
        "- firearms: guns, ammo, accessories, ghost guns\n" +
        "- cannabis_cbd: marijuana, CBD, THC, delta-8/9/10, edibles, dispensaries (even where state-legal)\n" +
        "- illegal_drugs: prescription drugs without Rx, controlled substances, research chemicals\n" +
        "- gambling: casinos, sportsbooks, lottery, betting apps, free spins / deposit bonuses\n" +
        "- payday_loans: payday/cash-advance/title loans, high-APR short-term lending, no-credit-check loans\n" +
        "- debt_collection: collection notices, debt-relief offers, garnishment threats, tax-debt relief\n" +
        "- crypto_scam: crypto giveaways, doubling schemes, guaranteed returns, presale/airdrop bait, celebrity-impersonation crypto\n" +
        "- get_rich_quick: 'make $X from home', passive-income systems, guaranteed-income schemes, MLM-style pitches\n" +
        "- fraud_deceptive: fake prize/winner notices, IRS/SSA/arrest threats, fake package-delivery links, fake refunds, impersonation of brands or government\n" +
        "- sexual: escort/adult services, explicit content\n" +
        "- hate_speech: extremist or hate-group content, incitement\n" +
        "- phishing: credential harvesting, fake account-verification links\n\n" +
        "Return allowed=true ONLY if the message is clearly safe for bulk SMS. " +
        "Be strict — promotional, recruitment, or 'opportunity' messages for ANY of these categories must be blocked, " +
        "including obfuscated wording (e.g. 'nic salt', 'D8', 'fast $$$', '🚀 100x', 'we buy debt'). " +
        "Return allowed=false with the specific category and a concise reason if prohibited.\n\n" +
        "IMPORTANT — do NOT block ordinary legitimate commerce. The following are ALLOWED and must return allowed=true:\n" +
        "- restaurant / takeaway / food or retail promos, discounts (e.g. '£10 OFF selected orders'), new stock or new arrivals announcements\n" +
        "- menu links, catalogue links, ordering links (including link shorteners or paste/menu hosting links)\n" +
        "- asking customers to order or enquire via WhatsApp, phone, or SMS, and listing contact phone numbers\n" +
        "- appointment reminders, delivery updates, loyalty offers, event invites\n" +
        "- party, event, entertainment, rental, and catering services (e.g. 'delivery to door', 'no party without us', 'write to see selection', 'book our service')\n" +
        "- general service businesses advertising quality guarantees, honest times, and customer service\n\n" +
        "CRITICAL DISTINCTIONS:\n" +
        "- 'Delivery to door' / 'delivery to your door' is common language for restaurants, caterers, event rentals, and many legal services. Do NOT treat it as drug-trafficking language unless the message also explicitly mentions drugs, narcotics, controlled substances, or unmistakable drug-dealing context.\n" +
        "- 'Party', 'fest', 'event', 'selection', 'write to see', and similar phrases are normal for event/party services. Only block if the message clearly promotes illegal drugs, alcohol to minors, or unregulated controlled substances.\n" +
        "- For illegal_drugs, require explicit drug/narcotic terms (e.g. weed, cocaine, pills, MDMA, Xanax, oxycodone, 'no Rx', 'research chemicals') or clear drug-dealing context. Do not infer drug sales from generic delivery/party wording alone.\n\n" +
        "EXAMPLES OF ALLOWED MESSAGES (return allowed=true):\n" +
        "- \"Er I trætte af lange ventetider, forsinkelser og dårlig kvalitet? Vi tilbyder kvalitetsgaranti og levering til døren! Ærlige tider og servicen er den bedste i byen. Der ingen fest uden os. Skriv for at se udvalget. Contact us: +45 81 91 17 11\" (Danish event/party service)\n" +
        "- \"Tired of long waits and poor service? We offer quality guarantee and delivery to your door. Honest times and the best service in town. No party without us. Write to see our selection.\" (event/party service)\n\n" +
        "Ambiguity is NOT grounds to block: only return allowed=false when the message itself clearly promotes a prohibited category in plain or lightly obfuscated wording. " +
        "If you are not confident, return allowed=true. Set confidence to 'high' only when the violation is unmistakable.",
      prompt:
        `Analyze this SMS campaign message for prohibited content.\n\n` +
        `Return ONLY a JSON object matching this schema (no markdown, no explanation):\n${jsonSchemaDescription}\n\n` +
        `Message:\n"""${messageBody}"""`,
    });

    // Extract and parse the JSON object from the model response.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const raw = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const result = AI_SCHEMA.parse(raw);

    // Only block on unmistakable violations. Medium/low-confidence AI opinions
    // are advisory only — they must never stop a legitimate campaign.
    const shouldBlock =
      result.allowed === false &&
      result.confidence === "high" &&
      !!result.category &&
      result.category !== "none";

    if (!shouldBlock) {
      return { allowed: true, confidence: "ai" };
    }

    return {
      allowed: false,
      category: result.category === "none" ? undefined : result.category,
      confidence: "ai",
      reason: result.reason,
    };

  } catch (e: any) {
    console.error("[content-scanner] AI scan failed:", e?.message ?? e);
    // Fail open: if AI scan errors, allow but log
    return { allowed: true, confidence: "none", reason: "AI scan unavailable — passed by default" };
  }
}
