import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TestSendSchema = z.object({
  to: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be E.164, e.g. +15551234567"),
  body: z.string().trim().min(1).max(1600),
  country: z.string().length(2).optional(),
});

export const TEST_SEND_DAILY_LIMIT = 5;

function startOfUtcDayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export const getTestSendUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = startOfUtcDayIso();
    const { count } = await supabase
      .from("campaign_test_sends")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    const used = count ?? 0;
    const reset = new Date();
    reset.setUTCHours(24, 0, 0, 0);
    return {
      used,
      limit: TEST_SEND_DAILY_LIMIT,
      remaining: Math.max(0, TEST_SEND_DAILY_LIMIT - used),
      resetsAt: reset.toISOString(),
    };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestSendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const sinceDay = startOfUtcDayIso();
    const { count: usedToday } = await supabase
      .from("campaign_test_sends")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceDay);
    if ((usedToday ?? 0) >= TEST_SEND_DAILY_LIMIT) {
      throw new Error(`Daily test limit reached (${TEST_SEND_DAILY_LIMIT}/day). Try again tomorrow (resets 00:00 UTC).`);
    }

    let countryCode = data.country?.toUpperCase();
    if (!countryCode) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rates } = await supabaseAdmin
        .from("country_rates").select("country_code,dial_prefix").eq("active", true);
      const { countryFromPhone } = await import("./country-from-phone");
      countryCode = countryFromPhone(data.to, (rates ?? []) as any) ?? undefined;
    }

    const { data: allAssets, error: assetsError } = await supabase
      .from("sender_assets")
      .select("telnyx_messaging_profile_id,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);
    if (assetsError) throw new Error(assetsError.message);

    function rank(a: any) {
      let s = 0;
      if (countryCode && a.country_code === countryCode) s += 1000;
      if (a.phone_number) s += 100;
      if (a.telnyx_messaging_profile_id) s += 80;
      if (a.sender_kind !== "sender_id") s += 20;
      return s;
    }
    const eligible = [...(allAssets ?? [])].filter(
      (a) => a.verification_status === "verified" && (a.telnyx_messaging_profile_id || a.phone_number),
    );
    const countryEligible = countryCode
      ? eligible.filter(
          (a) =>
            a.country_code === countryCode ||
            // Toll-free numbers approved in US or CA work for both (NANP TFV).
            ((countryCode === "US" || countryCode === "CA") &&
              a.sender_kind === "toll_free" &&
              (a.country_code === "US" || a.country_code === "CA")),
        )
      : eligible;
    const ranked = countryEligible.sort((x, y) => rank(y) - rank(x));
    const asset = ranked[0];
    if (!asset) {
      throw new Error(
        countryCode
          ? `No verified sender is available for ${countryCode}. Approve a ${countryCode} number before testing.`
          : "No verified sender is available yet. Finish SMS setup before testing.",
      );
    }

    // Telnyx requires messaging_profile_id for alphanumeric sends, and it
    // must be a Telnyx UUID — never a Twilio MG/AC SID.
    const { isValidTelnyxUuid, ensureMessagingProfileForAccount } = await import("./telnyx.server");
    let messagingProfileId: string | null | undefined = isValidTelnyxUuid(asset.telnyx_messaging_profile_id)
      ? asset.telnyx_messaging_profile_id
      : null;
    if (!messagingProfileId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: acct } = await supabaseAdmin
        .from("accounts")
        .select("telnyx_messaging_profile_id")
        .eq("id", userId)
        .maybeSingle();
      messagingProfileId = isValidTelnyxUuid(acct?.telnyx_messaging_profile_id)
        ? acct!.telnyx_messaging_profile_id
        : null;
    }
    if (!messagingProfileId) {
      // Auto-provision a Telnyx Messaging Profile for this account on first use.
      messagingProfileId = await ensureMessagingProfileForAccount(userId);
    }

    // ── Compliance firewall: screen every outbound message BEFORE Telnyx.
    const { screenMessageContent } = await import("./content-screening.server");
    const { TOS_CURRENT_VERSION } = await import("./tos");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("tos_current_version_accepted, sending_suspended_at")
      .eq("id", userId)
      .maybeSingle();
    if (acct?.sending_suspended_at) {
      throw new Error("Your sending has been suspended by an admin. Contact support.");
    }
    if (acct?.tos_current_version_accepted !== TOS_CURRENT_VERSION) {
      throw new Error("Please accept the updated Terms of Service before sending.");
    }
    const screen = await screenMessageContent(data.body, userId, {
      phoneE164: data.to,
      context: "test_send",
      skipReviewQueue: true, // test sends can't wait 2h for review
    });
    if (!screen.passed) {
      const top = screen.blockedReasons.slice(0, 2).join(" · ") || "content policy violation";
      throw new Error(
        `Message blocked before sending. Reason: ${top}. Edit the message (remove risky links, add STOP to opt out, drop restricted keywords) and try again. Risk score ${screen.riskScore}/100.`,
      );
    }

    const { sendMessage, safeTelnyxCall } = await import("./telnyx.server");
    try {
      const result = await safeTelnyxCall(
        "send_test_sms",
        { userId, messagingProfileId },
        () => sendMessage({
          to: data.to,
          text: data.body,
          from: asset.phone_number ?? undefined,
          messagingProfileId,
        }),
      );
      await supabase.from("campaign_test_sends").insert({
        user_id: userId,
        to_phone: data.to,
        twilio_sid: result.id,
      });
      return {
        sid: result.id,
        status: result.to?.[0]?.status ?? "queued",
        from: (asset.phone_number ?? asset.telnyx_messaging_profile_id) as string,
        sender_kind: asset.sender_kind as string,
        country: asset.country_code as string,
      };
    } catch (e: any) {
      throw new Error(e?.message ?? "Telnyx send failed");
    }
  });
