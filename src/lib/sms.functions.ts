import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

const TestSendSchema = z.object({
  to: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be E.164"),
  body: z.string().trim().min(1).max(1600),
});

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestSendSchema.parse(data))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const twilioKey = process.env.TWILIO_API_KEY;
    const msgService = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!lovableKey || !twilioKey) throw new Error("Twilio is not connected");
    if (!msgService) throw new Error("TWILIO_MESSAGING_SERVICE_SID is not set");

    const body = new URLSearchParams({
      To: data.to,
      MessagingServiceSid: msgService,
      Body: data.body,
    });

    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.message ?? `Twilio error ${res.status}`;
      throw new Error(msg);
    }
    return { sid: json.sid as string, status: json.status as string };
  });
