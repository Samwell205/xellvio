import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

async function fetchAll<T = any>(builder: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    if (out.length > 500_000) break;
  }
  return out;
}

/**
 * Balance-drop audit: given a date range, break down what caused Telnyx's
 * balance to move. Combines:
 *  - Derived SMS/MDR cost from public.messages × country_rates.cost_price
 *  - Toll-free verification fees (tollfree_verification_attempts submitted in window)
 *  - Imported Telnyx Transactions CSV rows in window (if any)
 *  - Balance snapshot movement from twilio_balance_snapshots
 */
export const getBalanceDropAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      start: z.string(),
      end: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const start = data.start;
    const end = data.end;

    // 1) Balance snapshots inside window
    const { data: snaps } = await supabaseAdmin
      .from("twilio_balance_snapshots")
      .select("balance,currency,checked_at,status")
      .gte("checked_at", start)
      .lte("checked_at", end)
      .order("checked_at", { ascending: true });
    const firstSnap = snaps?.[0] ?? null;
    const lastSnap = snaps?.[snaps.length - 1] ?? null;
    const snapshotDelta = firstSnap && lastSnap ? Number(lastSnap.balance) - Number(firstSnap.balance) : null;

    // 2) Rates
    const { data: rates } = await supabaseAdmin.from("country_rates").select("country_code,cost_price");
    const costByCc = new Map<string, number>();
    for (const r of rates ?? []) costByCc.set(r.country_code, Number(r.cost_price ?? 0));

    // 3) Messages in window
    const messages = await fetchAll<any>(() =>
      supabaseAdmin
        .from("messages")
        .select("id,campaign_id,country_code,segments_count,status,created_at,sender_used,sender_kind")
        .gte("created_at", start)
        .lte("created_at", end)
        .in("status", ["sent", "delivered", "delivery_unconfirmed", "undelivered"]),
    );
    let smsCost = 0;
    let smsSegments = 0;
    const byKind = new Map<string, { count: number; cost: number; segments: number }>();
    for (const m of messages) {
      const seg = Number(m.segments_count ?? 1);
      const cost = (costByCc.get(m.country_code ?? "??") ?? 0) * seg;
      smsCost += cost;
      smsSegments += seg;
      const k = m.sender_kind ?? "unknown";
      const cur = byKind.get(k) ?? { count: 0, cost: 0, segments: 0 };
      cur.count += 1; cur.cost += cost; cur.segments += seg;
      byKind.set(k, cur);
    }

    // 4) Toll-free verification fees submitted in window
    // Telnyx typically bills $75 per verification; fall back to 0 if unknown.
    const TFN_VERIFY_FEE = 75;
    const { data: tfnAttempts } = await supabaseAdmin
      .from("tollfree_verification_attempts")
      .select("id,phone_number,attempt_status,created_at")
      .in("attempt_status", ["submitted", "already_submitted"])
      .gte("created_at", start)
      .lte("created_at", end);
    let verificationFees = 0;
    const verificationLines: Array<{ occurred_at: string; phone_number: string | null; status: string; fee: number }> = [];
    for (const a of (tfnAttempts ?? []) as any[]) {
      verificationFees += TFN_VERIFY_FEE;
      verificationLines.push({
        occurred_at: a.created_at,
        phone_number: a.phone_number,
        status: a.attempt_status,
        fee: TFN_VERIFY_FEE,
      });
    }

    // 5) Imported transactions
    const { data: imported } = await supabaseAdmin
      .from("telnyx_transactions_import")
      .select("id,occurred_at,amount,currency,category,description,reference")
      .gte("occurred_at", start)
      .lte("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(5000);
    let importedDebits = 0;
    let importedCredits = 0;
    const importedByCategory = new Map<string, { amount: number; count: number }>();
    for (const t of imported ?? []) {
      const amt = Number(t.amount);
      if (amt < 0) importedDebits += Math.abs(amt);
      else importedCredits += amt;
      const cat = t.category ?? "uncategorized";
      const cur = importedByCategory.get(cat) ?? { amount: 0, count: 0 };
      cur.amount += Math.abs(amt); cur.count += 1;
      importedByCategory.set(cat, cur);
    }

    const derivedOutflow = smsCost + verificationFees;
    const observedOutflow = snapshotDelta === null ? null : -snapshotDelta; // positive if balance dropped
    const unexplained = observedOutflow === null ? null : observedOutflow - derivedOutflow;

    return {
      window: { start, end },
      snapshots: {
        first: firstSnap,
        last: lastSnap,
        delta: snapshotDelta,
        observed_outflow: observedOutflow,
      },
      derived: {
        sms_cost: +smsCost.toFixed(4),
        sms_segments: smsSegments,
        sms_messages: messages.length,
        verification_fees: +verificationFees.toFixed(4),
        verifications: verificationLines.length,
        total_derived_outflow: +derivedOutflow.toFixed(4),
        by_sender_kind: Array.from(byKind.entries()).map(([kind, v]) => ({ kind, ...v, cost: +v.cost.toFixed(4) })),
      },
      imported: {
        rows: imported ?? [],
        total_debits: +importedDebits.toFixed(4),
        total_credits: +importedCredits.toFixed(4),
        by_category: Array.from(importedByCategory.entries()).map(([category, v]) => ({ category, amount: +v.amount.toFixed(4), count: v.count })),
      },
      verifications: verificationLines,
      unexplained: unexplained === null ? null : +unexplained.toFixed(4),
    };
  });

export const importTelnyxTransactionsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(z.object({
        occurred_at: z.string(),
        amount: z.number(),
        currency: z.string().optional(),
        category: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        raw: z.any().optional(),
      })).max(20000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const batchId = crypto.randomUUID();
    const chunks: any[][] = [];
    for (let i = 0; i < data.rows.length; i += 500) chunks.push(data.rows.slice(i, i + 500));
    let inserted = 0;
    for (const c of chunks) {
      const rows = c.map((r) => ({
        batch_id: batchId,
        occurred_at: r.occurred_at,
        amount: r.amount,
        currency: r.currency ?? "USD",
        category: r.category ?? null,
        description: r.description ?? null,
        reference: r.reference ?? null,
        raw: r.raw ?? null,
        created_by: context.userId,
      }));
      const { error } = await supabaseAdmin.from("telnyx_transactions_import").insert(rows);
      if (error) throw new Error(error.message);
      inserted += rows.length;
    }
    return { batch_id: batchId, inserted };
  });

export const listImportedTransactionBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("telnyx_transactions_import")
      .select("batch_id,created_at,created_by")
      .order("created_at", { ascending: false })
      .limit(200);
    // Aggregate by batch
    const byBatch = new Map<string, { batch_id: string; created_at: string; rows: number }>();
    for (const r of data ?? []) {
      const cur = byBatch.get(r.batch_id) ?? { batch_id: r.batch_id, created_at: r.created_at, rows: 0 };
      cur.rows += 1;
      byBatch.set(r.batch_id, cur);
    }
    return Array.from(byBatch.values());
  });

export const deleteImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ batch_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("telnyx_transactions_import").delete().eq("batch_id", data.batch_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List every toll-free (or any) sender number ever used in messages, plus totals. */
export const listSenderNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Prefer sender_assets as the catalog (has kind + account)
    const { data: assets } = await supabaseAdmin
      .from("sender_assets")
      .select("phone_number,sender_kind,account_id,country_code,verification_status,is_shared")
      .not("phone_number", "is", null)
      .order("sender_kind", { ascending: true });

    const acctIds = Array.from(new Set((assets ?? []).map((a: any) => a.account_id)));
    let acctMap = new Map<string, any>();
    if (acctIds.length) {
      const { data: accts } = await supabaseAdmin
        .from("accounts").select("id,email,company,legal_business_name").in("id", acctIds);
      acctMap = new Map((accts ?? []).map((a: any) => [a.id, a]));
    }

    return (assets ?? []).map((a: any) => ({
      phone_number: a.phone_number,
      sender_kind: a.sender_kind,
      country_code: a.country_code,
      verification_status: a.verification_status,
      is_shared: a.is_shared,
      account_id: a.account_id,
      account_label: acctMap.get(a.account_id)?.legal_business_name || acctMap.get(a.account_id)?.company || acctMap.get(a.account_id)?.email || "—",
    }));
  });

/** Every SMS ever sent from a specific sender number, with derived MDR cost. */
export const getSenderNumberActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone_number: z.string().min(4) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rates } = await supabaseAdmin.from("country_rates").select("country_code,cost_price");
    const costByCc = new Map<string, number>((rates ?? []).map((r: any) => [r.country_code, Number(r.cost_price ?? 0)]));

    const msgs = await fetchAll<any>(() =>
      supabaseAdmin
        .from("messages")
        .select("id,campaign_id,phone_e164,country_code,status,segments_count,cost,provider_message_id,sent_at,delivered_at,created_at,error_code,failure_reason")
        .eq("sender_used", data.phone_number)
        .order("created_at", { ascending: false }),
    );

    let totalSegments = 0;
    let totalCarrier = 0;
    let totalTenantSpend = 0;
    let delivered = 0, failed = 0, unconfirmed = 0, sent = 0;
    const byStatus = new Map<string, number>();
    const rows = msgs.map((m) => {
      const seg = Number(m.segments_count ?? 1);
      const mdr = (costByCc.get(m.country_code ?? "??") ?? 0) * seg;
      totalSegments += seg;
      totalCarrier += mdr;
      totalTenantSpend += Number(m.cost ?? 0);
      if (m.status === "delivered") delivered += 1;
      else if (m.status === "failed" || m.status === "undelivered") failed += 1;
      else if (m.status === "delivery_unconfirmed") unconfirmed += 1;
      else if (m.status === "sent") sent += 1;
      byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
      return { ...m, mdr_cost: +mdr.toFixed(4) };
    });

    // Campaign names
    const campIds = Array.from(new Set(msgs.map((m) => m.campaign_id).filter(Boolean)));
    let campMap = new Map<string, string>();
    if (campIds.length) {
      const { data: camps } = await supabaseAdmin.from("campaigns").select("id,name").in("id", campIds);
      campMap = new Map((camps ?? []).map((c: any) => [c.id, c.name]));
    }

    return {
      totals: {
        messages: msgs.length,
        segments: totalSegments,
        carrier_cost: +totalCarrier.toFixed(4),
        tenant_spend: +totalTenantSpend.toFixed(4),
        margin: +(totalTenantSpend - totalCarrier).toFixed(4),
        delivered, failed, unconfirmed, sent,
        by_status: Array.from(byStatus.entries()).map(([s, n]) => ({ status: s, count: n })),
      },
      rows: rows.map((r) => ({
        ...r,
        campaign_name: r.campaign_id ? campMap.get(r.campaign_id) ?? "—" : "—",
      })),
    };
  });
