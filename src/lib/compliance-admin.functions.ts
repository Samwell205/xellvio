// Admin-only compliance controls: kill-switch, review queue actions, tenant
// screening history. Everything here validates has_role('admin') before it
// touches Telnyx or write-side data.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

// ---------- Kill switch -------------------------------------------------

const SuspendSchema = z.object({
  accountId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const adminSuspendTenantSending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SuspendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { suspendTenantSending } = await import("./tenant-suspension.server");
    return await suspendTenantSending({
      tenantAccountId: data.accountId,
      reason: data.reason,
      suspendedBy: context.userId,
    });
  });

const ResumeSchema = z.object({ accountId: z.string().uuid() });

export const adminResumeTenantSending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResumeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { resumeTenantSending } = await import("./tenant-suspension.server");
    return await resumeTenantSending({
      tenantAccountId: data.accountId,
      liftedBy: context.userId,
    });
  });

// ---------- Review queue ------------------------------------------------

export const adminListReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("review_queue")
      .select(
        "id, account_id, campaign_id, message_text, risk_score, blocked_reasons, status, reviewer_note, auto_approve_at, created_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Attach tenant emails.
    const ids = Array.from(new Set((rows ?? []).map((r) => r.account_id)));
    const emails: Record<string, string> = {};
    if (ids.length) {
      const { data: accts } = await supabaseAdmin
        .from("accounts").select("id,email,legal_business_name").in("id", ids);
      for (const a of accts ?? []) emails[a.id] = a.legal_business_name || a.email || a.id;
    }
    return (rows ?? []).map((r) => ({ ...r, tenant_label: emails[r.account_id] ?? r.account_id }));
  });

const ReviewActionSchema = z.object({
  reviewId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export const adminResolveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReviewActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("review_queue")
      .select("id, campaign_id, status")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (!row) throw new Error("Review entry not found");
    if (row.status !== "pending") throw new Error("Review already resolved");

    await supabaseAdmin
      .from("review_queue")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        reviewer_id: context.userId,
        reviewer_note: data.note ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId);

    // Sync the campaign it's tied to.
    if (row.campaign_id) {
      if (data.action === "approve") {
        await supabaseAdmin
          .from("campaigns")
          .update({ status: "queued", paused_reason: null })
          .eq("id", row.campaign_id)
          .eq("status", "paused");
      } else {
        await supabaseAdmin
          .from("campaigns")
          .update({ status: "blocked_content", paused_reason: `Rejected in review: ${data.note ?? "no reason given"}` })
          .eq("id", row.campaign_id);
      }
    }

    return { ok: true };
  });

// ---------- Per-tenant screening history ----------------------------------

export const adminTenantScreeningHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().uuid(), limit: z.number().int().min(1).max(500).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("content_screening_log")
      .select("id, campaign_id, risk_score, action_taken, blocked_reasons, context, created_at")
      .eq("account_id", data.accountId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });
