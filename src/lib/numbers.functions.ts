import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

function twHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov || !tw) throw new Error("Twilio is not configured");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": tw,
  };
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Must be E.164, e.g. +15558675310");

// ============================================================
// TOLL-FREE NUMBERS (US / CA)
// ============================================================
const searchSchema = z.object({
  country: z.enum(["US", "CA"]),
  contains: z.string().max(10).optional(),
});

export const searchTollFree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ PageSize: "20", SmsEnabled: "true" });
    if (data.contains) params.set("Contains", data.contains);
    const res = await fetch(`${GATEWAY}/AvailablePhoneNumbers/${data.country}/TollFree.json?${params}`, {
      headers: twHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `Twilio ${res.status}`);
    const items = (json.available_phone_numbers ?? []).map((n: any) => ({
      phone_number: n.phone_number as string,
      friendly_name: n.friendly_name as string,
      locality: n.locality as string | null,
      region: n.region as string | null,
    }));
    return { items };
  });

const purchaseSchema = z.object({
  phone_number: e164,
  country: z.enum(["US", "CA"]),
  label: z.string().max(60).optional(),
});

export const purchaseTollFree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => purchaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const res = await fetch(`${GATEWAY}/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: { ...twHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ PhoneNumber: data.phone_number }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `Twilio ${res.status}: could not purchase number`);

    const { error } = await supabase.from("phone_numbers").insert({
      user_id: userId,
      e164: json.phone_number ?? data.phone_number,
      type: "toll_free",
      country: data.country,
      status: "active",
      twilio_sid: json.sid,
      label: data.label ?? "Toll-free",
    });
    if (error) throw new Error(error.message);
    return { ok: true, sid: json.sid as string, number: json.phone_number as string };
  });

// ============================================================
// PERSONAL NUMBER VERIFICATION (OTP via SMS)
// ============================================================
const startSchema = z.object({ e164 });

export const startPhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // already verified?
    const { data: existing } = await supabase
      .from("phone_numbers").select("id").eq("user_id", userId).eq("e164", data.e164).maybeSingle();
    if (existing) throw new Error("This number is already on your account");

    // rate-limit: at most 1 active OTP per (user, number) per minute
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("phone_verifications").select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("e164", data.e164).gte("created_at", oneMinAgo);
    if ((count ?? 0) > 0) throw new Error("Please wait a minute before requesting a new code");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(`${userId}:${data.e164}:${code}`);
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: insErr } = await supabase.from("phone_verifications").insert({
      user_id: userId, e164: data.e164, code_hash, expires_at,
    });
    if (insErr) throw new Error(insErr.message);

    const from = process.env.TWILIO_FROM;
    if (!from) throw new Error("Server is missing TWILIO_FROM — ask the admin to set it");

    const res = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: { ...twHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: data.e164, From: from,
        Body: `Your Samwell Global SMS verification code is ${code}. It expires in 10 minutes.`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `Twilio ${res.status}: could not send code`);
    return { ok: true };
  });

const checkSchema = z.object({ e164, code: z.string().regex(/^\d{6}$/), label: z.string().max(60).optional() });

export const checkPhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rec, error } = await supabase
      .from("phone_verifications").select("*")
      .eq("user_id", userId).eq("e164", data.e164).is("consumed_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("No verification in progress. Send a new code.");
    if (new Date(rec.expires_at) < new Date()) throw new Error("Code expired. Send a new one.");
    if (rec.attempts >= 5) throw new Error("Too many attempts. Send a new code.");

    const expected = await sha256Hex(`${userId}:${data.e164}:${data.code}`);
    if (expected !== rec.code_hash) {
      await supabase.from("phone_verifications").update({ attempts: rec.attempts + 1 }).eq("id", rec.id);
      throw new Error("Incorrect code");
    }

    await supabase.from("phone_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", rec.id);

    const { error: insErr } = await supabase.from("phone_numbers").insert({
      user_id: userId, e164: data.e164, type: "personal",
      country: data.e164.startsWith("+1") ? "US" : "INT",
      status: "active", label: data.label ?? "My phone",
    });
    if (insErr && !/duplicate/i.test(insErr.message)) throw new Error(insErr.message);
    return { ok: true };
  });

const delNumSchema = z.object({ id: z.string().uuid() });
export const deletePhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => delNumSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("phone_numbers").select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (!row) throw new Error("Not found");
    // Best-effort release of toll-free in Twilio
    if (row.type === "toll_free" && row.twilio_sid) {
      await fetch(`${GATEWAY}/IncomingPhoneNumbers/${row.twilio_sid}.json`, { method: "DELETE", headers: twHeaders() }).catch(() => {});
    }
    const { error } = await supabase.from("phone_numbers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// SENDER IDS (admin approval workflow)
// ============================================================
const senderReqSchema = z.object({
  sender_id: z.string().trim().min(2).max(11).regex(/^[A-Za-z0-9 ]+$/, "Letters, digits and spaces only (max 11 chars)"),
  countries: z.array(z.string().length(2)).max(20).default([]),
  use_case: z.string().max(500).optional(),
});

export const requestSenderId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => senderReqSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("sender_ids").insert({
      user_id: userId, sender_id: data.sender_id, countries: data.countries, use_case: data.use_case, status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export const reviewSenderId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabase.from("sender_ids").update({
      status: data.decision, review_note: data.note, reviewed_at: new Date().toISOString(), reviewed_by: userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
