import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// One person, one verifier account. Identity = NIN (unique), ID photo + selfie
// reviewed by an admin, plus device / connection signals for duplicate flags.

async function hashNin(nin: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`xellvio-nin:${nin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeImage(dataUrl: string) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Please upload a JPG, PNG or WEBP image");
  const bin = atob(m[3]);
  if (bin.length > 6 * 1024 * 1024) throw new Error("Image is too large (max 6MB)");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
}

async function myVerifier(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("verifiers").select("id,is_active").eq("user_id", userId).maybeSingle();
  return { supabaseAdmin, verifier: data };
}

export const getMyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("verifier_identity")
      .select("nin_last4,status,admin_note,created_at,reviewed_at")
      .maybeSingle();
    return data ?? null;
  });

export const submitMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      nin: z.string().regex(/^\d{11}$/, "NIN must be 11 digits"),
      id_photo: z.string().min(50),
      selfie: z.string().min(50),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, verifier } = await myVerifier(context.userId);
    if (!verifier) throw new Error("Complete your verifier profile first");
    const nin_hash = await hashNin(data.nin);

    const { data: existing } = await supabaseAdmin
      .from("verifier_identity").select("verifier_id,status").eq("nin_hash", nin_hash).maybeSingle();
    if (existing && existing.verifier_id !== verifier.id) {
      await supabaseAdmin.from("verifiers").update({ is_active: false }).eq("id", verifier.id);
      throw new Error("This NIN is already linked to another verifier account. Only one account per person is allowed, so this account has been suspended.");
    }
    const { data: mine } = await supabaseAdmin
      .from("verifier_identity").select("status").eq("verifier_id", verifier.id).maybeSingle();
    if (mine?.status === "approved") throw new Error("Your identity is already approved");

    const id = decodeImage(data.id_photo);
    const sf = decodeImage(data.selfie);
    const stamp = Date.now();
    const idPath = `${verifier.id}/id-${stamp}.${id.ext}`;
    const sfPath = `${verifier.id}/selfie-${stamp}.${sf.ext}`;
    const up1 = await supabaseAdmin.storage.from("verifier-kyc").upload(idPath, id.bytes, { contentType: id.type });
    if (up1.error) throw new Error(up1.error.message);
    const up2 = await supabaseAdmin.storage.from("verifier-kyc").upload(sfPath, sf.bytes, { contentType: sf.type });
    if (up2.error) throw new Error(up2.error.message);

    const { error } = await supabaseAdmin.from("verifier_identity").upsert({
      verifier_id: verifier.id,
      nin_hash,
      nin_last4: data.nin.slice(-4),
      id_photo_path: idPath,
      selfie_path: sfPath,
      status: "pending",
      admin_note: null,
      reviewed_at: null,
    }, { onConflict: "verifier_id" });
    if (error) {
      if (error.message.includes("nin_hash")) throw new Error("This NIN is already linked to another account.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const recordVerifierDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ device_id: z.string().min(8).max(100), fingerprint: z.string().max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, verifier } = await myVerifier(context.userId);
    if (!verifier) return { ok: false };
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = (getRequestHeader("user-agent") ?? "").slice(0, 300);
    await supabaseAdmin.from("verifier_device_signals").upsert({
      verifier_id: verifier.id,
      device_id: data.device_id,
      fingerprint: data.fingerprint ?? null,
      ip: ip ?? "",
      user_agent: ua,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "verifier_id,device_id,ip" });
    return { ok: true };
  });

// ============ Admin ============

async function assertAdmin(supabase: any) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const adminListIdentityChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ids }, { data: signals }, { data: verifiers }] = await Promise.all([
      supabaseAdmin.from("verifier_identity").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("verifier_device_signals").select("verifier_id,device_id,fingerprint,ip"),
      supabaseAdmin.from("verifiers").select("id,full_name,email"),
    ]);
    const vName = Object.fromEntries((verifiers ?? []).map((v) => [v.id, v]));

    // Device / connection overlap between different verifiers
    const byKey = new Map<string, Set<string>>();
    for (const s of signals ?? []) {
      for (const k of [`device:${s.device_id}`, s.fingerprint ? `fp:${s.fingerprint}` : "", s.ip ? `ip:${s.ip}` : ""]) {
        if (!k) continue;
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k)!.add(s.verifier_id);
      }
    }
    const flags: Record<string, { device: string[]; ip: string[] }> = {};
    for (const [k, set] of byKey) {
      if (set.size < 2) continue;
      const kind = k.startsWith("ip:") ? "ip" : "device";
      for (const v of set) {
        const f = flags[v] ?? (flags[v] = { device: [], ip: [] });
        for (const o of set) if (o !== v && !f[kind].includes(o)) f[kind].push(o);
      }
    }
    const flagged = Object.fromEntries(
      Object.entries(flags).map(([v, f]) => [v, {
        device: f.device.map((id) => vName[id]?.email ?? id),
        ip: f.ip.map((id) => vName[id]?.email ?? id),
      }]),
    );

    const identities = await Promise.all((ids ?? []).map(async (r) => {
      const [a, b] = await Promise.all([
        supabaseAdmin.storage.from("verifier-kyc").createSignedUrl(r.id_photo_path, 3600),
        supabaseAdmin.storage.from("verifier-kyc").createSignedUrl(r.selfie_path, 3600),
      ]);
      return {
        verifier_id: r.verifier_id,
        name: vName[r.verifier_id]?.full_name ?? "",
        email: vName[r.verifier_id]?.email ?? "",
        nin_last4: r.nin_last4,
        status: r.status,
        admin_note: r.admin_note,
        created_at: r.created_at,
        id_photo_url: a.data?.signedUrl ?? null,
        selfie_url: b.data?.signedUrl ?? null,
      };
    }));
    return { identities, flags: flagged };
  });

export const adminReviewIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      verifier_id: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("verifier_identity").update({
      status: data.decision,
      admin_note: data.note ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("verifier_id", data.verifier_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
