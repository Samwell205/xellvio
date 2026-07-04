// Kill-switch: immediately disable a tenant's Telnyx Messaging Profile from
// sending, mark the account row, and record an auditable suspension entry.
// Server-only — never import from a route module at top level.

const TELNYX_BASE = "https://api.telnyx.com/v2";

async function telnyxPatchProfileEnabled(
  profileId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) return { ok: false, error: "TELNYX_API_KEY missing" };
  try {
    const res = await fetch(`${TELNYX_BASE}/messaging_profiles/${profileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function suspendTenantSending(opts: {
  tenantAccountId: string;
  reason: string;
  suspendedBy?: string | null;
}): Promise<{ ok: boolean; telnyxOk: boolean; telnyxError?: string; suspensionId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("id, telnyx_messaging_profile_id")
    .eq("id", opts.tenantAccountId)
    .maybeSingle();
  if (!acct) throw new Error("Account not found");

  // Flip Telnyx off first so no in-flight sends slip through. Non-fatal if the
  // API errors — the DB flag still blocks the dispatcher.
  let telnyxOk = true;
  let telnyxError: string | undefined;
  if (acct.telnyx_messaging_profile_id) {
    const r = await telnyxPatchProfileEnabled(acct.telnyx_messaging_profile_id, false);
    telnyxOk = r.ok;
    telnyxError = r.error;
  }

  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("accounts")
    .update({
      sending_suspended_at: nowIso,
      sending_suspended_reason: opts.reason.slice(0, 500),
    })
    .eq("id", opts.tenantAccountId);

  const { data: log } = await supabaseAdmin
    .from("tenant_sending_suspensions")
    .insert({
      account_id: opts.tenantAccountId,
      reason: opts.reason.slice(0, 500),
      suspended_by: opts.suspendedBy ?? null,
      telnyx_profile_id: acct.telnyx_messaging_profile_id ?? null,
      telnyx_error: telnyxError ?? null,
    })
    .select("id")
    .single();

  // Halt every in-flight campaign for this tenant.
  await supabaseAdmin
    .from("campaigns")
    .update({ status: "paused", paused_reason: `Sending suspended: ${opts.reason.slice(0, 200)}`, paused_at: nowIso })
    .eq("account_id", opts.tenantAccountId)
    .in("status", ["queued", "sending", "scheduled"]);

  return { ok: true, telnyxOk, telnyxError, suspensionId: log!.id };
}

export async function resumeTenantSending(opts: {
  tenantAccountId: string;
  liftedBy?: string | null;
}): Promise<{ ok: boolean; telnyxOk: boolean; telnyxError?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("id, telnyx_messaging_profile_id")
    .eq("id", opts.tenantAccountId)
    .maybeSingle();
  if (!acct) throw new Error("Account not found");

  let telnyxOk = true;
  let telnyxError: string | undefined;
  if (acct.telnyx_messaging_profile_id) {
    const r = await telnyxPatchProfileEnabled(acct.telnyx_messaging_profile_id, true);
    telnyxOk = r.ok;
    telnyxError = r.error;
  }

  await supabaseAdmin
    .from("accounts")
    .update({ sending_suspended_at: null, sending_suspended_reason: null })
    .eq("id", opts.tenantAccountId);

  await supabaseAdmin
    .from("tenant_sending_suspensions")
    .update({ lifted_at: new Date().toISOString(), lifted_by: opts.liftedBy ?? null })
    .eq("account_id", opts.tenantAccountId)
    .is("lifted_at", null);

  return { ok: true, telnyxOk, telnyxError };
}
