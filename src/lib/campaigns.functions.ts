import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { countryFromPhone } from "./country-from-phone";

const AudienceSchema = z.object({
  include: z.array(z.string().uuid()).default([]),
  exclude: z.array(z.string().uuid()).default([]),
  profile_ids: z.array(z.string().uuid()).default([]),
});

export type SenderPreviewRow = {
  country_code: string;
  country_name: string;
  recipients: number;
  sender: {
    sender_kind: string;
    phone_number: string | null;
    messaging_service_sid: string | null;
    verification_status: string;
  } | null;
  eligible: boolean;
};

export const previewCampaignSenders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audience: AudienceSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    rows: SenderPreviewRow[];
    totalRecipients: number;
    missingCountries: string[];
  }> => {
    const { supabase } = context;

    // Resolve eligible recipients via the existing RPC.
    const { data: recipients, error: rErr } = await (supabase.rpc as any)(
      "my_eligible_profile_ids",
      { _audience: data.audience },
    );
    if (rErr) throw new Error(rErr.message);

    const { data: rates } = await supabase
      .from("country_rates_public")
      .select("country_code,country_name,dial_prefix")
      .eq("active", true);
    const dial = (rates ?? []).map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));
    const nameByCC: Record<string, string> = {};
    for (const r of rates ?? []) nameByCC[r.country_code] = r.country_name;

    const counts: Record<string, number> = {};
    for (const p of (recipients ?? []) as any[]) {
      const cc = p.country_code || countryFromPhone(p.phone_e164, dial) || "??";
      counts[cc] = (counts[cc] ?? 0) + 1;
    }

    const { data: assets } = await supabase
      .from("sender_assets")
      .select("country_code,sender_kind,phone_number,messaging_service_sid,verification_status");

    const sendersByCountry: Record<string, any> = {};
    for (const a of assets ?? []) {
      if (a.verification_status !== "verified") continue;
      if (!sendersByCountry[a.country_code]) sendersByCountry[a.country_code] = a;
    }

    const rows: SenderPreviewRow[] = Object.entries(counts)
      .map(([cc, n]) => {
        const sender = sendersByCountry[cc] ?? null;
        return {
          country_code: cc,
          country_name: nameByCC[cc] ?? cc,
          recipients: n,
          sender: sender
            ? {
                sender_kind: sender.sender_kind,
                phone_number: sender.phone_number,
                messaging_service_sid: sender.messaging_service_sid,
                verification_status: sender.verification_status,
              }
            : null,
          eligible: !!sender,
        };
      })
      .sort((a, b) => b.recipients - a.recipients);

    const missingCountries = rows.filter((r) => !r.eligible).map((r) => r.country_code);
    const totalRecipients = Object.values(counts).reduce((a, b) => a + b, 0);
    return { rows, totalRecipients, missingCountries };
  });
