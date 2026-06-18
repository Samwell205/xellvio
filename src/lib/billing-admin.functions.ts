import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

export const adminListPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("credit_packs").select("*").order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCreditPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; description?: string;
    currency: "NGN" | "USD"; price: number; credits: number;
    display_order?: number; is_active?: boolean; is_popular?: boolean;
  }) => {
    if (!d.name?.trim()) throw new Error("Name required");
    if (!["NGN", "USD"].includes(d.currency)) throw new Error("Invalid currency");
    if (!(d.price > 0)) throw new Error("Price must be > 0");
    if (!(d.credits > 0)) throw new Error("Credits must be > 0");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = {
      name: data.name.trim(),
      description: data.description ?? null,
      currency: data.currency,
      price: data.price,
      credits: data.credits,
      display_order: data.display_order ?? 0,
      is_active: data.is_active ?? true,
      is_popular: data.is_popular ?? false,
    };
    if (data.id) {
      const { error } = await context.supabase.from("credit_packs").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("credit_packs").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteCreditPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("credit_packs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    payoneer_payee_email?: string | null;
    payoneer_payee_name?: string | null;
    payoneer_instructions?: string | null;
    default_currency?: "NGN" | "USD";
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("billing_settings").upsert({ id: true, ...data });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { status?: "pending" | "paid" | "failed" | "cancelled" }) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("payments")
      .select("id,account_id,provider,currency,amount,credits,status,proof_url,customer_note,admin_note,provider_reference,created_at,paid_at,pack_id, accounts:account_id(legal_business_name,contact_email,email)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const approvePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error: gErr } = await supabaseAdmin
      .from("payments").select("id,account_id,credits,currency,amount,status,provider").eq("id", data.id).maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!p) throw new Error("Payment not found");
    if (p.status === "paid") return { ok: true, already: true };

    const { error: rpcErr } = await supabaseAdmin.rpc("topup_account", {
      _account_id: p.account_id,
      _amount: p.credits,
      _description: `${p.provider} ${p.currency} ${p.amount} — admin approved`,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    await supabaseAdmin.from("payments").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      admin_note: data.note ?? null,
    }).eq("id", data.id);
    return { ok: true };
  });

export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").update({
      status: "cancelled",
      admin_note: data.note ?? "Rejected by admin",
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signedProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs").createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
