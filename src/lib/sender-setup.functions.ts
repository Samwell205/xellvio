import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TWILIO_API = "https://api.twilio.com/2010-04-01";
const MESSAGING_API = "https://messaging.twilio.com/v1";

function masterAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio master credentials not configured");
  return { sid, token };
}

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilio<T = any>(
  url: string,
  opts: { method?: string; sid: string; token: string; body?: Record<string, string | string[]> },
): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basic(opts.sid, opts.token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (opts.body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.body)) {
      if (Array.isArray(v)) for (const x of v) params.append(k, x);
      else params.append(k, v);
    }
    init.body = params.toString();
  }
  const res = await fetch(url, init);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Twilio ${res.status}: ${json?.message ?? "request failed"}`);
    (err as any).twilioCode = json?.code;
    (err as any).twilioStatus = res.status;
    throw err;
  }
  return json as T;
}

/** Country → sender strategy. US/CA require toll-free; everywhere else
 *  defaults to an alphanumeric Sender ID (no number purchase, no KYC). */
function pickSenderKind(country: string): "toll_free" | "local" | "sender_id" {
  const cc = country.toUpperCase();
  if (cc === "US" || cc === "CA") return "toll_free";
  return "sender_id";
}

/** Build a clean alphanumeric Sender ID from a business name (max 11 chars). */
function senderIdFromName(name: string, requested?: string): string {
  const cleaned = (requested || name || "Sender")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 11);
  return cleaned.length >= 3 ? cleaned : (cleaned + "SMS").slice(0, 11);
}

/** Map a Twilio rejection into plain English the customer can act on. */
function friendlyReason(raw: string | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("privacy")) return "Your website needs a visible Privacy Policy link.";
  if (t.includes("terms")) return "Your website needs a visible Terms of Service link.";
  if (t.includes("opt") || t.includes("consent"))
    return "We need clearer proof of how subscribers opt in. Please update the opt-in description or upload a screenshot of your sign-up form.";
  if (t.includes("sample") || t.includes("message"))
    return "The sample message you provided doesn't match what carriers expect. Please revise it.";
  if (t.includes("website") || t.includes("url"))
    return "Your business website isn't reachable. Please double-check the URL.";
  if (t.includes("address"))
    return "The business address couldn't be verified. Please check it for typos.";
  return "The carrier needs some details corrected. Please review your business info and try again.";
}

const SetupInput = z.object({
  targetCountries: z.array(z.string().length(2)).min(1),
  monthlyVolume: z.number().int().min(1),
  useCase: z.string().min(20),
  sampleMessage: z.string().min(20),
  optInDescription: z.string().min(20),
  optInScreenshotPath: z.string().optional(),
  customSenderId: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const cleaned = value.trim().toUpperCase();
      return cleaned === "" ? undefined : cleaned;
    },
    z
      .string()
      .regex(/^[A-Z0-9]{3,11}$/, "Sender ID must be 3–11 letters or numbers")
      .optional(),
  ),
  // Profile fields (editable in wizard step 1) - persisted before this call.
});

const CustomSenderInput = z.object({
  countries: z.array(z.string().length(2)).min(1),
  senderId: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z0-9]{3,11}$/, "Sender ID must be 3–11 letters or numbers"),
  ),
});

export const setupSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof SetupInput>) => SetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { encryptToken, decryptToken } = await import("./tenant-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct, error } = await supabaseAdmin
      .from("accounts")
      .select(
        "id,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,contact_email,full_name,phone,twilio_subaccount_sid,onboarding_status",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error || !acct) throw new Error("Account not found");

    // The encrypted Twilio token column is revoked from tenant SELECT.
    // Fetch it through the admin client so server logic can still decrypt it.
    const { data: acctSecret } = await supabaseAdmin
      .from("accounts")
      .select("twilio_subaccount_auth_token_enc")
      .eq("id", userId)
      .maybeSingle();
    const tokenEnc = acctSecret?.twilio_subaccount_auth_token_enc ?? null;
    if (acct.onboarding_status === "suspended") throw new Error("Account suspended");
    if (
      !acct.legal_business_name ||
      !acct.business_address ||
      !acct.website_url ||
      !acct.contact_email
    ) {
      throw new Error(
        "Please complete your business profile first (legal name, address, website, contact email).",
      );
    }

    // Persist wizard answers
    await supabaseAdmin
      .from("accounts")
      .update({
        sms_target_countries: data.targetCountries,
        monthly_volume_estimate: data.monthlyVolume,
        use_case_description: data.useCase,
        sample_message: data.sampleMessage,
        opt_in_description: data.optInDescription,
        opt_in_screenshot_url: data.optInScreenshotPath ?? null,
      })
      .eq("id", userId);

    // 1) Use the main SMS account for provisioning. Creating per-tenant subaccounts can hit provider limits.
    let subSid = acct.twilio_subaccount_sid;
    let subToken: string;
    if (!subSid) {
      const master = masterAuth();
      subSid = master.sid;
      subToken = master.token;
      await supabaseAdmin
        .from("accounts")
        .update({
          twilio_subaccount_sid: subSid,
          twilio_subaccount_auth_token_enc: encryptToken(subToken) as any,
          onboarding_status: "sender_pending",
        })
        .eq("id", userId);
    } else {
      try {
        if (!tokenEnc) throw new Error("Subaccount token missing");
        subToken = decryptToken(tokenEnc as unknown as string);
      } catch {
        const master = masterAuth();
        subSid = master.sid;
        subToken = master.token;
        await supabaseAdmin
          .from("accounts")
          .update({
            twilio_subaccount_sid: subSid,
            twilio_subaccount_auth_token_enc: encryptToken(subToken) as any,
            onboarding_status: "sender_pending",
          })
          .eq("id", userId);
      }
    }

    // 2) For each target country, provision a sender
    const created: string[] = [];
    const errors: Array<{ cc: string; reason: string }> = [];
    for (const cc of data.targetCountries) {
      try {
        const kind = pickSenderKind(cc);
        const existing = await supabaseAdmin
          .from("sender_assets")
          .select("id")
          .eq("account_id", userId)
          .eq("country_code", cc)
          .maybeSingle();
        if (existing.data) {
          created.push(`${cc}:exists`);
          continue;
        }

        // For Sender-ID countries, no number purchase — register an alphanumeric Sender ID
        if (kind === "sender_id") {
          const sid = senderIdFromName(acct.legal_business_name || "Sender", data.customSenderId);
          const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
          // Messaging service is best-effort; if it fails we still record the sender so the user sees progress.
          let msSid: string | null = null;
          try {
            const ms = await twilio<{ sid: string }>(`${MESSAGING_API}/Services`, {
              method: "POST",
              sid: subSid,
              token: subToken,
              body: {
                FriendlyName: `${(acct.legal_business_name ?? "Sender").slice(0, 40)} ${cc} (Sender ID)`,
                InboundRequestUrl: `${base}/api/public/twilio-inbound`,
                StatusCallback: `${base}/api/public/twilio-status`,
              },
            });
            msSid = ms.sid;
            try {
              await twilio(`${MESSAGING_API}/Services/${msSid}/AlphaSenders`, {
                method: "POST",
                sid: subSid,
                token: subToken,
                body: { AlphaSender: sid },
              });
            } catch {
              /* Twilio may auto-pick on send */
            }
          } catch (e: any) {
            errors.push({
              cc,
              reason: `Sender ID provisioned but messaging service setup failed: ${e?.message ?? "unknown"}`,
            });
          }
          await supabaseAdmin.from("sender_assets").insert({
            account_id: userId,
            country_code: cc,
            sender_kind: kind,
            phone_number: sid,
            phone_sid: null,
            messaging_service_sid: msSid,
            verification_status: "verified",
          });
          if (!created.length) {
            await supabaseAdmin
              .from("accounts")
              .update({
                subaccount_phone_number: sid,
                subaccount_messaging_service_sid: msSid,
                onboarding_status: "active",
              })
              .eq("id", userId);
          }
          created.push(`${cc}:sender_id`);
          continue;
        }

        // Buy a number (toll-free for US/CA, local otherwise)
        const path =
          kind === "toll_free"
            ? `/Accounts/${subSid}/AvailablePhoneNumbers/${cc}/TollFree.json?SmsEnabled=true&PageSize=1`
            : `/Accounts/${subSid}/AvailablePhoneNumbers/${cc}/Local.json?SmsEnabled=true&PageSize=1`;
        const avail = await twilio<{ available_phone_numbers: Array<{ phone_number: string }> }>(
          `${TWILIO_API}${path}`,
          { sid: subSid, token: subToken },
        );
        const num = avail.available_phone_numbers?.[0]?.phone_number;
        if (!num) {
          created.push(`${cc}:no_numbers`);
          continue;
        }

        const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
        const bought = await twilio<{ sid: string; phone_number: string }>(
          `${TWILIO_API}/Accounts/${subSid}/IncomingPhoneNumbers.json`,
          {
            method: "POST",
            sid: subSid,
            token: subToken,
            body: {
              PhoneNumber: num,
              SmsUrl: `${base}/api/public/twilio-inbound`,
              StatusCallback: `${base}/api/public/twilio-status`,
            },
          },
        );

        // Create a messaging service in the subaccount and attach the number
        const ms = await twilio<{ sid: string }>(`${MESSAGING_API}/Services`, {
          method: "POST",
          sid: subSid,
          token: subToken,
          body: {
            FriendlyName: `${acct.legal_business_name} ${cc}`,
            InboundRequestUrl: `${base}/api/public/twilio-inbound`,
            StatusCallback: `${base}/api/public/twilio-status`,
          },
        });
        await twilio(`${MESSAGING_API}/Services/${ms.sid}/PhoneNumbers`, {
          method: "POST",
          sid: subSid,
          token: subToken,
          body: { PhoneNumberSid: bought.sid },
        });

        let verificationSid: string | null = null;
        const status: "submitted" | "verified" = kind === "toll_free" ? "submitted" : "verified";

        if (kind === "toll_free") {
          // Build absolute opt-in screenshot URL (signed) if uploaded
          let optInImageUrl: string | undefined;
          if (data.optInScreenshotPath) {
            const signed = await supabaseAdmin.storage
              .from("opt-in-assets")
              .createSignedUrl(data.optInScreenshotPath, 60 * 60 * 24 * 30);
            if (signed.data?.signedUrl) optInImageUrl = signed.data.signedUrl;
          }
          const addr = (acct.business_address ?? "")
            .split(/\n|,/)
            .map((s) => s.trim())
            .filter(Boolean);
          const verifBody: Record<string, string | string[]> = {
            TollfreePhoneNumberSid: bought.sid,
            BusinessName: acct.legal_business_name!,
            BusinessWebsite: acct.website_url!,
            NotificationEmail: acct.contact_email!,
            UseCaseCategories: ["MARKETING"],
            UseCaseSummary: data.useCase,
            ProductionMessageSample: data.sampleMessage,
            OptInType: "VERBAL",
            MessageVolume:
              data.monthlyVolume <= 1000
                ? "10"
                : data.monthlyVolume <= 10000
                  ? "1,000"
                  : data.monthlyVolume <= 100000
                    ? "10,000"
                    : "100,000",
            BusinessStreetAddress: addr[0] ?? acct.business_address!,
            BusinessCity: addr[1] ?? "",
            BusinessStateProvinceRegion: addr[2] ?? "",
            BusinessPostalCode: addr[3] ?? "",
            BusinessCountry: cc,
            BusinessContactFirstName: (acct.full_name ?? "").split(" ")[0] || "Owner",
            BusinessContactLastName:
              (acct.full_name ?? "").split(" ").slice(1).join(" ") || "Account",
            BusinessContactEmail: acct.contact_email!,
            BusinessContactPhone: acct.phone ?? "",
          };
          if (optInImageUrl) verifBody.OptInImageUrls = [optInImageUrl];
          if (acct.privacy_policy_url)
            verifBody.AdditionalInformation = `Privacy: ${acct.privacy_policy_url}`;

          try {
            const ver = await twilio<{ sid: string }>(`${MESSAGING_API}/Tollfree/Verifications`, {
              method: "POST",
              sid: subSid,
              token: subToken,
              body: verifBody,
            });
            verificationSid = ver.sid;
          } catch (e: any) {
            // Submission failed — keep the asset and surface a friendly reason for re-submit.
            await supabaseAdmin.from("sender_assets").insert({
              account_id: userId,
              country_code: cc,
              sender_kind: kind,
              phone_number: bought.phone_number,
              phone_sid: bought.sid,
              messaging_service_sid: ms.sid,
              verification_status: "rejected",
              rejection_reason: e.message,
              friendly_rejection_reason: friendlyReason(e.message),
            });
            created.push(`${cc}:rejected`);
            continue;
          }
        }

        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: kind,
          phone_number: bought.phone_number,
          phone_sid: bought.sid,
          messaging_service_sid: ms.sid,
          verification_sid: verificationSid,
          verification_status: status,
        });

        // For the first sender, also set the legacy account-level subaccount fields for the existing dispatch path.
        if (!created.length) {
          await supabaseAdmin
            .from("accounts")
            .update({
              subaccount_phone_number: bought.phone_number,
              subaccount_phone_sid: bought.sid,
              subaccount_messaging_service_sid: ms.sid,
              onboarding_status: status === "verified" ? "active" : "sender_pending",
            })
            .eq("id", userId);
        }
        created.push(`${cc}:${status}`);
      } catch (e: any) {
        errors.push({ cc, reason: e?.message ?? "unknown error" });
      }
    }

    return { created, errors };
  });

/** Reconcile pending toll-free verifications for one or all tenants. */
export async function syncToollfreeVerifications(opts: { onlyAccountId?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken } = await import("./tenant-crypto.server");

  let q = supabaseAdmin
    .from("sender_assets")
    .select("id,account_id,country_code,verification_sid,phone_number")
    .in("verification_status", ["submitted", "in_review"])
    .eq("sender_kind", "toll_free");
  if (opts.onlyAccountId) q = q.eq("account_id", opts.onlyAccountId);
  const { data: pending } = await q;
  if (!pending || pending.length === 0) return { checked: 0, updated: 0 };

  // group by account to share decrypted token
  const byAccount = new Map<string, { token: string; subSid: string } | null>();
  let updated = 0;

  for (const sa of pending) {
    if (!sa.verification_sid) continue;
    let creds = byAccount.get(sa.account_id);
    if (creds === undefined) {
      const { data: acct } = await supabaseAdmin
        .from("accounts")
        .select(
          "twilio_subaccount_sid,twilio_subaccount_auth_token_enc,contact_email,legal_business_name",
        )
        .eq("id", sa.account_id)
        .maybeSingle();
      if (!acct?.twilio_subaccount_sid || !acct.twilio_subaccount_auth_token_enc) {
        byAccount.set(sa.account_id, null);
        continue;
      }
      creds = {
        subSid: acct.twilio_subaccount_sid,
        token: decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string),
      };
      byAccount.set(sa.account_id, creds);
    }
    if (!creds) continue;

    try {
      const ver = await twilio<any>(
        `${MESSAGING_API}/Tollfree/Verifications/${sa.verification_sid}`,
        {
          sid: creds.subSid,
          token: creds.token,
        },
      );
      const tStatus: string = (ver.status ?? "").toUpperCase();
      let mapped: "submitted" | "in_review" | "verified" | "rejected" = "submitted";
      let reason: string | null = null;
      if (tStatus === "APPROVED" || tStatus === "TWILIO_APPROVED") mapped = "verified";
      else if (tStatus === "REJECTED" || tStatus === "TWILIO_REJECTED") {
        mapped = "rejected";
        reason = Array.isArray(ver.rejection_reason)
          ? ver.rejection_reason.join("; ")
          : (ver.rejection_reason ?? ver.errors?.[0]?.description ?? "rejected");
      } else if (tStatus === "PENDING_REVIEW" || tStatus === "IN_REVIEW") mapped = "in_review";

      const patch: any = { verification_status: mapped, last_synced_at: new Date().toISOString() };
      if (reason) {
        patch.rejection_reason = reason;
        patch.friendly_rejection_reason = friendlyReason(reason);
      }
      await supabaseAdmin.from("sender_assets").update(patch).eq("id", sa.id);

      if (mapped === "verified") {
        await supabaseAdmin
          .from("accounts")
          .update({ onboarding_status: "active" })
          .eq("id", sa.account_id);
      }
      updated++;
    } catch {
      // ignore one-off API errors; will retry on next poll
    }
  }
  return { checked: pending.length, updated };
}

export const getMySenderAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("sender_assets")
      .select("*")
      .eq("account_id", userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveCustomSenderId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof CustomSenderInput>) => CustomSenderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const countries = Array.from(
      new Set(
        data.countries.map((cc) => cc.toUpperCase()).filter((cc) => cc !== "US" && cc !== "CA"),
      ),
    );
    if (countries.length === 0)
      throw new Error("Sender ID is not available for US or Canada. Choose another country.");

    const { data: acct, error } = await supabaseAdmin
      .from("accounts")
      .select("onboarding_status")
      .eq("id", userId)
      .maybeSingle();
    if (error || !acct) throw new Error("Account not found");
    if (acct.onboarding_status === "suspended") throw new Error("Account suspended");

    const saved: string[] = [];
    for (const cc of countries) {
      const { data: existing } = await supabaseAdmin
        .from("sender_assets")
        .select("id")
        .eq("account_id", userId)
        .eq("country_code", cc)
        .eq("sender_kind", "sender_id")
        .limit(1)
        .maybeSingle();

      const row = {
        account_id: userId,
        country_code: cc,
        sender_kind: "sender_id",
        phone_number: data.senderId,
        phone_sid: null,
        messaging_service_sid: null,
        verification_sid: null,
        verification_status: "verified",
        rejection_reason: null,
        friendly_rejection_reason: null,
      };
      if (existing?.id) await supabaseAdmin.from("sender_assets").update(row).eq("id", existing.id);
      else await supabaseAdmin.from("sender_assets").insert(row);
      saved.push(cc);
    }

    await supabaseAdmin
      .from("accounts")
      .update({
        subaccount_phone_number: data.senderId,
        subaccount_messaging_service_sid: null,
        onboarding_status: "active",
      })
      .eq("id", userId);

    return { senderId: data.senderId, countries: saved };
  });

export const refreshMyVerificationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return syncToollfreeVerifications({ onlyAccountId: context.userId });
  });
