import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden");
  return userId;
}

export const listAllSenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: senders, error } = await supabaseAdmin
      .from("sender_assets")
      .select("id, account_id, country_code, sender_kind, phone_number, verification_status, telnyx_verification_id, rejection_reason, friendly_rejection_reason, submitted_at, verified_at, rejected_at, last_synced_at, telnyx_phone_number_id, telnyx_messaging_profile_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const acctIds = Array.from(new Set((senders ?? []).map((s: any) => s.account_id)));
    const { data: accts } = acctIds.length
      ? await supabaseAdmin.from("accounts").select("id, email, legal_business_name").in("id", acctIds)
      : { data: [] as any[] };
    const byId = new Map((accts ?? []).map((a: any) => [a.id, a]));
    return (senders ?? []).map((s: any) => ({
      ...s,
      tenant_email: byId.get(s.account_id)?.email ?? null,
      tenant_business: byId.get(s.account_id)?.legal_business_name ?? null,
    }));
  });

export const adminRefreshSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("sender_assets")
      .select("id, telnyx_verification_id, sender_kind").eq("id", data.senderId).maybeSingle();
    if (!row?.telnyx_verification_id || row.sender_kind !== "toll_free") {
      return { ok: false, reason: "Only submitted toll-free rows can be refreshed." };
    }
    const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");
    const res = await fetchTwilioTollfreeVerification({
      verificationSid: row.telnyx_verification_id, accountSid: "", authToken: "",
    });
    await supabaseAdmin.from("sender_assets").update({
      verification_status: res.status,
      rejection_reason: res.rejectionReason,
      last_synced_at: new Date().toISOString(),
    }).eq("id", data.senderId);
    return { ok: true, status: res.status };
  });

export const adminMarkSenderVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sender_assets").update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      rejection_reason: null,
      friendly_rejection_reason: null,
    }).eq("id", data.senderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { senderId: string }) => z.object({ senderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sender_assets").delete().eq("id", data.senderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin grant: give a tenant a ready-to-send toll-free number without any
// carrier verification flow. If a phone_number is supplied, that number is
// wired to the tenant (must not already be assigned to another tenant). If
// omitted, we search Telnyx for an available number in the given country and
// buy it. The resulting sender_asset is marked "verified" so the tenant can
// send immediately, and the toll-free setup fee is auto-cleared.
export const adminGrantVerifiedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      account_id: z.string().uuid(),
      country: z.string().default("US"),
      phone_number: z.string().trim().min(6).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const country = data.country.toUpperCase();
    let phoneNumber = data.phone_number?.trim() || "";

    if (phoneNumber) {
      const { data: existing } = await supabaseAdmin
        .from("sender_assets").select("id,account_id").eq("phone_number", phoneNumber).maybeSingle();
      if (existing && existing.account_id !== data.account_id) {
        throw new Error("This number is already assigned to another tenant.");
      }
    } else {
      const { searchAvailableNumbers, orderNumber, ensureMessagingProfileForAccount, safeTelnyxCall } =
        await import("./telnyx.server");
      const messagingProfileId = await ensureMessagingProfileForAccount(data.account_id);
      const available = await safeTelnyxCall(
        "admin_grant_search", { userId: data.account_id, messagingProfileId },
        () => searchAvailableNumbers({ country, numberType: "toll-free", limit: 5 }),
      );
      const pick = available[0];
      if (!pick) throw new Error("No toll-free numbers are available on Telnyx right now.");
      const order = await safeTelnyxCall(
        "admin_grant_order", { userId: data.account_id, messagingProfileId },
        () => orderNumber({ phoneNumber: pick.phone_number, messagingProfileId }),
      );
      const bought = order.phone_numbers?.[0];
      if (!bought) throw new Error("Telnyx accepted the order but did not return a phone number.");
      phoneNumber = bought.phone_number;
    }

    const { wireAssignedTollfreeForTenant } = await import("./assign-tfn-to-tenant.server");
    await wireAssignedTollfreeForTenant({
      accountId: data.account_id,
      phoneNumber,
      countryCode: country,
      markVerified: true,
    });
    return { ok: true, phone_number: phoneNumber };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Shared toll-free pool
//
// One approved TFN on ONE Telnyx Messaging Profile, reused across many
// tenants. Attach = insert a sender_assets row (is_shared=true, verified)
// pointing at the shared phone + messaging_profile_id. Dispatcher already
// picks the sender_asset's messaging_profile_id when sending, so no
// changes there.
// ─────────────────────────────────────────────────────────────────────────────

const NA = new Set(["US", "CA", "PR"]);
function fanoutCountries(country: string): string[] {
  const cc = country.toUpperCase();
  return NA.has(cc) ? ["US", "CA", "PR"] : [cc];
}

async function syncSharedPoolFromTelnyx(supabaseAdmin: any, createdBy: string): Promise<{ synced: number; error: string | null }> {
  try {
    const { listAccountTollfreeNumbers, listVerifiedTollfreeNumbers } = await import("@/lib/telnyx.server");
    const [numbers, verified] = await Promise.all([
      listAccountTollfreeNumbers(),
      listVerifiedTollfreeNumbers(),
    ]);
    const rows = numbers
      .filter((n) => !!n.messaging_profile_id && verified.has(n.phone_number))
      .map((n) => ({
        phone_number: n.phone_number,
        country_code: (n.country_code ?? "US").toUpperCase(),
        telnyx_phone_number_id: n.id,
        telnyx_messaging_profile_id: n.messaging_profile_id,
        notes: null as string | null,
        created_by: createdBy,
      }));
    const keepPhones = rows.map((r) => r.phone_number);
    const staleReason = "This shared toll-free number is not verified in Telnyx Toll-Free Verification, so it cannot be used for US/CA SMS.";
    // Remove pool rows and disable tenant attachments that are no longer verified on Telnyx.
    if (keepPhones.length) {
      await supabaseAdmin.from("shared_tollfree_pool").delete().not("phone_number", "in", `(${keepPhones.map((p) => `"${p}"`).join(",")})`);
      await supabaseAdmin.from("sender_assets").update({
        verification_status: "requires_registration",
        rejection_reason: staleReason,
        friendly_rejection_reason: staleReason,
        last_synced_at: new Date().toISOString(),
      }).eq("is_shared", true).not("phone_number", "in", `(${keepPhones.map((p) => `"${p}"`).join(",")})`);
    } else {
      await supabaseAdmin.from("shared_tollfree_pool").delete().neq("phone_number", "");
      await supabaseAdmin.from("sender_assets").update({
        verification_status: "requires_registration",
        rejection_reason: staleReason,
        friendly_rejection_reason: staleReason,
        last_synced_at: new Date().toISOString(),
      }).eq("is_shared", true);
    }
    if (rows.length) {
      await supabaseAdmin.from("shared_tollfree_pool").upsert(rows, { onConflict: "phone_number" });
    }
    return { synced: rows.length, error: null };
  } catch (e: any) {
    return { synced: 0, error: e?.message ?? "Telnyx sync failed" };
  }
}

export const adminSyncSharedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncSharedPoolFromTelnyx(supabaseAdmin, context.userId);
  });

export const adminListSharedTollfree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sync = await syncSharedPoolFromTelnyx(supabaseAdmin, context.userId);
    const { data: pool } = await supabaseAdmin
      .from("shared_tollfree_pool")
      .select("phone_number,country_code,telnyx_phone_number_id,telnyx_messaging_profile_id,notes,created_at")
      .order("created_at", { ascending: false });
    const phones = (pool ?? []).map((p: any) => p.phone_number);
    const { data: attachments } = phones.length
      ? await supabaseAdmin
          .from("sender_assets")
          .select("id,account_id,phone_number,country_code,verification_status,is_shared")
          .in("phone_number", phones)
          .eq("is_shared", true)
      : { data: [] as any[] };
    const acctIds = Array.from(new Set((attachments ?? []).map((a: any) => a.account_id)));
    const { data: accts } = acctIds.length
      ? await supabaseAdmin.from("accounts").select("id,email,legal_business_name").in("id", acctIds)
      : { data: [] as any[] };
    const byAcct = new Map((accts ?? []).map((a: any) => [a.id, a]));
    const byPhone = new Map<string, any[]>();
    for (const a of attachments ?? []) {
      const list = byPhone.get(a.phone_number) ?? [];
      list.push({
        ...a,
        tenant_email: byAcct.get(a.account_id)?.email ?? null,
        tenant_business: byAcct.get(a.account_id)?.legal_business_name ?? null,
      });
      byPhone.set(a.phone_number, list);
    }
    // Deduplicate attachments by account (a NA number appears under US/CA/PR).
    const items = (pool ?? []).map((p: any) => {
      const raw = byPhone.get(p.phone_number) ?? [];
      const seen = new Map<string, any>();
      for (const a of raw) if (!seen.has(a.account_id)) seen.set(a.account_id, a);
      return { ...p, attachments: Array.from(seen.values()) };
    });
    return { items, sync };
  });

export const adminCreateSharedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone_number: z.string().trim().regex(/^\+\d{6,15}$/, "E.164 phone required, e.g. +18885550123"),
      country: z.string().length(2).default("US"),
      notes: z.string().trim().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPhoneNumberByE164, listVerifiedTollfreeNumbers } = await import("@/lib/telnyx.server");

    const found = await getPhoneNumberByE164(data.phone_number);
    if (!found) throw new Error("This number is not on your Telnyx account.");
    const verified = await listVerifiedTollfreeNumbers();
    if (!verified.has(data.phone_number)) {
      throw new Error("This number is not approved in Telnyx Toll-Free Verification yet, so it cannot be added to the shared pool.");
    }
    const profileId = found.messaging_profile_id;
    if (!profileId) {
      throw new Error("Assign this number to a Messaging Profile in Telnyx first, then register it here.");
    }


    const { error } = await supabaseAdmin.from("shared_tollfree_pool").upsert({
      phone_number: data.phone_number,
      country_code: data.country.toUpperCase(),
      telnyx_phone_number_id: found.id,
      telnyx_messaging_profile_id: profileId,
      notes: data.notes ?? null,
      created_by: context.userId,
    }, { onConflict: "phone_number" });
    if (error) throw new Error(error.message);
    return { ok: true, phone_number: data.phone_number, telnyx_messaging_profile_id: profileId };
  });

export const adminAttachSharedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone_number: z.string().trim().regex(/^\+\d{6,15}$/),
      account_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pool } = await supabaseAdmin
      .from("shared_tollfree_pool")
      .select("phone_number,country_code,telnyx_phone_number_id,telnyx_messaging_profile_id")
      .eq("phone_number", data.phone_number).maybeSingle();
    if (!pool) throw new Error("That number is not in the shared pool. Register it first.");

    const nowIso = new Date().toISOString();
    const countries = fanoutCountries(pool.country_code);
    for (const cc of countries) {
      const { data: existing } = await supabaseAdmin
        .from("sender_assets")
        .select("id,phone_number,account_id")
        .eq("account_id", data.account_id)
        .eq("country_code", cc)
        .eq("sender_kind", "toll_free")
        .maybeSingle();
      if (existing && existing.phone_number && existing.phone_number !== pool.phone_number) {
        throw new Error(`Tenant already has a different toll-free number (${existing.phone_number}) for ${cc}. Detach it first.`);
      }
      const row = {
        account_id: data.account_id,
        country_code: cc,
        sender_kind: "toll_free" as const,
        phone_number: pool.phone_number,
        telnyx_phone_number_id: pool.telnyx_phone_number_id,
        telnyx_messaging_profile_id: pool.telnyx_messaging_profile_id,
        verification_status: "verified" as const,
        verified_at: nowIso,
        rejected_at: null,
        rejection_reason: null,
        friendly_rejection_reason: null,
        last_synced_at: nowIso,
        is_shared: true,
      };
      const { error } = await supabaseAdmin
        .from("sender_assets")
        .upsert(row, { onConflict: "account_id,country_code,sender_kind" });
      if (error) throw new Error(error.message);
    }

    // Clear tollfree setup fee so tenant isn't billed for a shared number.
    await supabaseAdmin.from("accounts").update({
      tollfree_setup_fee_due_cents: 0,
      tollfree_setup_fee_paid_at: nowIso,
      onboarding_status: "active",
    }).eq("id", data.account_id);

    return { ok: true };
  });

export const adminDetachSharedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone_number: z.string().trim().regex(/^\+\d{6,15}$/),
      account_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sender_assets")
      .delete()
      .eq("account_id", data.account_id)
      .eq("phone_number", data.phone_number)
      .eq("is_shared", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSharedTollfree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone_number: z.string().trim().regex(/^\+\d{6,15}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("sender_assets")
      .select("id", { count: "exact", head: true })
      .eq("phone_number", data.phone_number)
      .eq("is_shared", true);
    if ((count ?? 0) > 0) throw new Error("Detach all tenants before removing this pool number.");
    const { error } = await supabaseAdmin
      .from("shared_tollfree_pool").delete().eq("phone_number", data.phone_number);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


