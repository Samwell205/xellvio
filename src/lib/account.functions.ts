import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const email = user?.email ?? null;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      "";

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("accounts")
      .select("id,email,contact_email,full_name")
      .eq("id", userId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existing) {
      const { error } = await supabaseAdmin.from("accounts").insert({
        id: userId,
        email,
        contact_email: email,
        full_name: fullName,
      });
      if (error) throw error;
      await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });
      return { created: true };
    }

    const patch: { email?: string; contact_email?: string; full_name?: string } = {};
    if (!existing.email && email) patch.email = email;
    if (!existing.contact_email && email) patch.contact_email = email;
    if (!existing.full_name && fullName) patch.full_name = fullName;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("accounts").update(patch).eq("id", userId);
      if (error) throw error;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });
    return { created: false };
  });

/** Returns onboarding/Twilio provisioning status without exposing credentials to the client. */
export const getProvisioningStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("telnyx_number_id,telnyx_phone_number,telnyx_messaging_profile_id,onboarding_status")
      .eq("id", userId)
      .maybeSingle();
    return {
      hasSubaccount: !!data?.telnyx_messaging_profile_id,
      hasNumber: !!data?.telnyx_phone_number,
      phoneNumber: data?.telnyx_phone_number ?? null,
      messagingServiceSid: data?.telnyx_messaging_profile_id ? "configured" : null,
      onboardingStatus: data?.onboarding_status ?? "signup",
    };
  });

/** Save business profile and mark onboarding step as complete. Self-only. */
export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    legal_business_name: string;
    business_address: string;
    business_reg_number: string;
    website_url: string;
    privacy_policy_url?: string;
    terms_url?: string;
    contact_email: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const required = ["legal_business_name", "business_address", "business_reg_number", "website_url", "contact_email"] as const;
    for (const k of required) {
      if (!data[k] || !String(data[k]).trim()) throw new Error(`${k.replace(/_/g, " ")} is required`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .upsert({
        id: userId,
        legal_business_name: data.legal_business_name,
        business_address: data.business_address,
        business_reg_number: data.business_reg_number,
        website_url: data.website_url,
        privacy_policy_url: data.privacy_policy_url ?? null,
        terms_url: data.terms_url ?? null,
        contact_email: data.contact_email,
        onboarding_status: "profile_complete",
      }, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  });

/** Admin-only: suspend or reactivate a tenant account. */
export const adminSetSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; suspend: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _role: "admin" });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({
        onboarding_status: data.suspend ? "suspended" : "active",
        suspended_at: data.suspend ? new Date().toISOString() : null,
      })
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });