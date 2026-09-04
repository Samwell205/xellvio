// Server-only engine for SMS automations ("flows").
// Reuses the same sender selection, pricing, balance check, compliance screening
// and debiting rules as 1:1 inbox replies so nothing about billing changes.

export type FlowTrigger = "new_contact" | "list_join" | "keyword_reply";

/** Send one automated SMS on behalf of a tenant. Throws on any refusal. */
export async function sendAutomationSms(accountId: string, phone: string, body: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("sending_suspended_at, tos_current_version_accepted, credit_balance")
    .eq("id", accountId)
    .maybeSingle();
  if (!acct) throw new Error("Account not found");
  if (acct.sending_suspended_at) throw new Error("Sending suspended");

  const { data: assets } = await supabaseAdmin
    .from("sender_assets")
    .select("telnyx_messaging_profile_id,phone_number,country_code,verification_status")
    .eq("account_id", accountId);
  const eligible = (assets ?? []).filter(
    (a) => a.verification_status === "verified" && (a.telnyx_messaging_profile_id || a.phone_number),
  );
  if (eligible.length === 0) throw new Error("No verified sender available");
  const asset = eligible[0];

  const { calculateSegments } = await import("./sms-segments");
  const { countryFromPhone } = await import("./country-from-phone");
  const { data: ratesData } = await supabaseAdmin
    .from("country_rates")
    .select("country_code,dial_prefix,sell_price,active")
    .eq("active", true);
  const rates = (ratesData ?? []) as Array<{ country_code: string; dial_prefix: string; sell_price: number }>;
  const cc =
    countryFromPhone(phone, rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }))) ??
    asset.country_code ??
    "US";
  const rate = rates.find((r) => r.country_code === cc);
  const segs = calculateSegments(body).segments || 1;
  const cost = +(segs * (rate ? Number(rate.sell_price) : 0)).toFixed(4);
  if (cost > 0 && Number(acct.credit_balance ?? 0) < cost) throw new Error("Insufficient credit");

  // Do not send to suppressed / unsubscribed contacts.
  const { data: sup } = await supabaseAdmin
    .from("suppressions")
    .select("phone_e164")
    .eq("account_id", accountId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (sup) throw new Error("Contact is unsubscribed");

  const { screenMessageContent } = await import("./content-screening.server");
  const screen = await screenMessageContent(body, accountId, {
    phoneE164: phone,
    context: "inbox_reply",
    skipReviewQueue: true,
  });
  if (!screen.passed) {
    throw new Error(`Blocked by content policy (risk ${screen.riskScore}/100)`);
  }

  const { sendMessage, safeTelnyxCall } = await import("./telnyx.server");
  const result = await safeTelnyxCall(
    "send_automation",
    { userId: accountId, messagingProfileId: asset.telnyx_messaging_profile_id ?? null },
    () =>
      sendMessage({
        to: phone,
        text: body,
        from: asset.phone_number ?? undefined,
        messagingProfileId: asset.telnyx_messaging_profile_id ?? undefined,
      }),
  );

  await supabaseAdmin.from("sms_thread_messages").insert({
    account_id: accountId,
    phone_e164: phone,
    direction: "outbound",
    body,
    from_number: asset.phone_number ?? null,
    to_number: phone,
    provider_sid: result.id ?? null,
    status: result.to?.[0]?.status ?? "sent",
  });

  if (cost > 0) {
    try {
      await (supabaseAdmin.rpc as any)("debit_account", {
        _account_id: accountId,
        _amount: cost,
        _campaign_id: null,
        _description: `Automation SMS → ${phone} (${cc}) × ${segs}`,
      });
    } catch {
      /* balance verified above */
    }
  }
  return { sid: result.id as string, cost };
}

function renderBody(body: string, ctx: { first_name?: string | null; last_name?: string | null }) {
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, ctx.first_name?.trim() || "there")
    .replace(/\{\{\s*last_name\s*\}\}/gi, ctx.last_name?.trim() || "");
}

/**
 * Schedule every step of matching live flows for one contact.
 * Idempotent — the (flow, phone, step) unique index prevents duplicates.
 */
export async function enqueueFlowTriggers(opts: {
  accountId: string;
  phone: string;
  trigger: FlowTrigger;
  listId?: string | null;
  keyword?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("sms_flows")
    .select("id, trigger_type, trigger_keyword, trigger_list_id")
    .eq("account_id", opts.accountId)
    .eq("status", "live")
    .eq("trigger_type", opts.trigger);
  const { data: flows } = await q;
  if (!flows || flows.length === 0) return { scheduled: 0 };

  const matching = flows.filter((f) => {
    if (opts.trigger === "list_join") return !f.trigger_list_id || f.trigger_list_id === opts.listId;
    if (opts.trigger === "keyword_reply") {
      const kw = (f.trigger_keyword ?? "").trim().toUpperCase();
      return kw.length > 0 && kw === (opts.keyword ?? "").trim().toUpperCase();
    }
    return true;
  });
  if (matching.length === 0) return { scheduled: 0 };

  const { data: steps } = await supabaseAdmin
    .from("sms_flow_steps")
    .select("id, flow_id, position, delay_minutes")
    .in("flow_id", matching.map((f) => f.id))
    .order("position", { ascending: true });
  if (!steps || steps.length === 0) return { scheduled: 0 };

  const now = Date.now();
  const rows = steps.map((s) => ({
    flow_id: s.flow_id,
    account_id: opts.accountId,
    phone_e164: opts.phone,
    step_id: s.id,
    step_position: s.position,
    run_at: new Date(now + (s.delay_minutes ?? 0) * 60_000).toISOString(),
    status: "scheduled",
  }));
  const { error } = await supabaseAdmin
    .from("sms_flow_runs")
    .upsert(rows, { onConflict: "flow_id,phone_e164,step_position", ignoreDuplicates: true });
  if (error) return { scheduled: 0, error: error.message };
  return { scheduled: rows.length };
}

/** Process due automation sends. Called by the background job. */
export async function processDueFlowRuns(limit = 100) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: due } = await supabaseAdmin
    .from("sms_flow_runs")
    .select("id, account_id, phone_e164, step_id, flow_id")
    .eq("status", "scheduled")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(Math.min(limit, 200));
  if (!due || due.length === 0) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const run of due) {
    try {
      const [{ data: step }, { data: flow }, { data: profile }] = await Promise.all([
        supabaseAdmin.from("sms_flow_steps").select("body").eq("id", run.step_id!).maybeSingle(),
        supabaseAdmin.from("sms_flows").select("status").eq("id", run.flow_id).maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("first_name,last_name")
          .eq("account_id", run.account_id)
          .eq("phone_e164", run.phone_e164)
          .maybeSingle(),
      ]);
      if (!step || flow?.status !== "live") {
        await supabaseAdmin.from("sms_flow_runs").update({ status: "skipped" }).eq("id", run.id);
        continue;
      }
      await sendAutomationSms(run.account_id, run.phone_e164, renderBody(step.body, profile ?? {}));
      await supabaseAdmin
        .from("sms_flow_runs")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", run.id);
      sent += 1;
    } catch (e: any) {
      failed += 1;
      await supabaseAdmin
        .from("sms_flow_runs")
        .update({ status: "failed", error: String(e?.message ?? e).slice(0, 300) })
        .eq("id", run.id);
    }
  }
  return { processed: due.length, sent, failed };
}
