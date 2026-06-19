import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  country: z.enum(["US", "CA"]),
  number_type: z.enum(["toll_free", "ten_dlc", "short_code"]),
  business_name: z.string().trim().min(2).max(120),
  business_website: z.string().trim().max(255).optional().or(z.literal("")),
  use_case: z.string().trim().min(10).max(1000),
  sample_message: z.string().trim().min(10).max(1000),
  expected_monthly_volume: z.coerce.number().int().min(0).max(10_000_000),
});

export const submitNumberRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("number_requests")
      .insert({
        account_id: userId,
        requested_by: userId,
        country: data.country,
        number_type: data.number_type,
        business_name: data.business_name,
        business_website: data.business_website || null,
        use_case: data.use_case,
        sample_message: data.sample_message,
        expected_monthly_volume: data.expected_monthly_volume,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Try to auto-review and auto-purchase the number on Twilio.
    // Failures here never break the submission — the request just stays
    // pending for manual review.
    let autoResult: { provisioned: boolean; phone_number?: string; note?: string } = { provisioned: false };
    try {
      const { autoReview, autoPurchaseNumber } = await import("./auto-provision-number.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const review = autoReview({
        country: data.country,
        number_type: data.number_type,
        business_name: data.business_name,
        business_website: data.business_website || null,
        use_case: data.use_case,
        sample_message: data.sample_message,
        expected_monthly_volume: data.expected_monthly_volume,
      });

      if (!review.ok) {
        autoResult = { provisioned: false, note: review.reason };
        await supabaseAdmin
          .from("number_requests")
          .update({ admin_notes: `Auto-review: ${review.reason}` })
          .eq("id", row.id);
      } else {
        const purchased = await autoPurchaseNumber({
          country: data.country,
          number_type: data.number_type as "toll_free" | "ten_dlc",
          friendlyName: `${data.business_name} (${data.country})`,
        });
        await supabaseAdmin
          .from("number_requests")
          .update({
            status: "provisioned",
            assigned_phone_number: purchased.phone_number,
            admin_notes: "Auto-approved and provisioned by system.",
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        autoResult = { provisioned: true, phone_number: purchased.phone_number };
      }
    } catch (e: any) {
      console.error("[number-requests] auto-provision failed", e);
      autoResult = { provisioned: false, note: e?.message ?? "Auto-provisioning failed; queued for manual review." };
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("number_requests")
          .update({ admin_notes: `Auto-provision error: ${autoResult.note}` })
          .eq("id", row.id);
      } catch {}
    }

    // Admin notification (fire-and-forget).
    try {
      const { sendAdminSms } = await import("./admin-notify.server");
      const status = autoResult.provisioned
        ? `AUTO-PROVISIONED ${autoResult.phone_number}`
        : `pending manual review (${autoResult.note ?? "see admin"})`;
      const msg = `New ${data.country} ${data.number_type.replace("_", " ")} request from ${data.business_name} — ${status}.`;
      await sendAdminSms(msg);
    } catch (e) {
      console.error("[number-requests] admin notify failed", e);
    }

    return { ...row, auto: autoResult };
  });


export const listMyNumberRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("number_requests")
      .select("*")
      .eq("account_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const cancelMyNumberRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("number_requests")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "provisioned"]),
  admin_notes: z.string().trim().max(2000).optional(),
  assigned_phone_number: z.string().trim().max(32).optional(),
});

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden");
  return userId;
}

export const adminListNumberRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("number_requests")
      .select("*, accounts:account_id(email, full_name, contact_email)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminReviewNumberRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("number_requests")
      .update({
        status: data.status,
        admin_notes: data.admin_notes ?? null,
        assigned_phone_number: data.assigned_phone_number ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
