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

async function checkSelfie(dataUrl: string): Promise<{ ok: boolean; reason: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Face check is temporarily unavailable. Please try again shortly.");
  const prompt = 'You verify selfies for identity checks. Approve only if the image is a live photo of exactly one real human face, clearly visible, eyes open, not covered, taken directly with a camera. Reject photos of screens, printed photos, ID cards, cartoons, AI art, group photos, blurry or dark images. Give a short reason the person can act on.';
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: dataUrl },
      ] }],
      text: { format: { type: "json_schema", name: "selfie_check", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["ok", "reason"],
        properties: { ok: { type: "boolean" }, reason: { type: "string" } },
      } } },
    }),
  });
  if (!res.ok || !res.body) throw new Error("Face check is temporarily unavailable. Please try again shortly.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
      } catch { /* ignore partial */ }
    }
  }
  try {
    const out = JSON.parse(text);
    return { ok: out.ok === true, reason: String(out.reason ?? "") };
  } catch {
    throw new Error("Face check failed. Please try again.");
  }
}

export const submitMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      nin: z.string().regex(/^\d{11}$/, "NIN must be 11 digits"),
      selfie: z.string().min(50),
      device_id: z.string().max(100).optional(),
      fingerprint: z.string().max(100).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, verifier } = await myVerifier(context.userId);
    if (!verifier) throw new Error("Complete your verifier profile first");
    const nin_hash = await hashNin(data.nin);

    // 1. One NIN per person
    const { data: existing } = await supabaseAdmin
      .from("verifier_identity").select("verifier_id").eq("nin_hash", nin_hash).maybeSingle();
    if (existing && existing.verifier_id !== verifier.id) {
      await supabaseAdmin.from("verifiers").update({ is_active: false }).eq("id", verifier.id);
      throw new Error("This NIN is already linked to another verifier account. Only one account per person is allowed, so this account has been suspended.");
    }
    const { data: mine } = await supabaseAdmin
      .from("verifier_identity").select("status").eq("verifier_id", verifier.id).maybeSingle();
    if (mine?.status === "approved") throw new Error("Your identity is already approved");

    const sf = decodeImage(data.selfie);
    const sfPath = `${verifier.id}/selfie-${Date.now()}.${sf.ext}`;
    const up = await supabaseAdmin.storage.from("verifier-kyc").upload(sfPath, sf.bytes, { contentType: sf.type });
    if (up.error) throw new Error(up.error.message);

    // 2. Same device as another verifier account
    const keys = [data.device_id, data.fingerprint].filter(Boolean) as string[];
    let sharedDevice = false;
    if (keys.length) {
      const orParts = [
        data.device_id ? `device_id.eq.${data.device_id}` : "",
        data.fingerprint ? `fingerprint.eq.${data.fingerprint}` : "",
      ].filter(Boolean).join(",");
      const { data: hits } = await supabaseAdmin
        .from("verifier_device_signals").select("verifier_id").or(orParts).neq("verifier_id", verifier.id).limit(1);
      sharedDevice = (hits ?? []).length > 0;
    }

    // 3. Automatic face check
    let status: "approved" | "rejected" = "approved";
    let note: string | null = null;
    if (sharedDevice) {
      status = "rejected";
      note = "This device is already used by another verifier account. Only one account per person is allowed.";
    } else {
      const face = await checkSelfie(data.selfie);
      if (!face.ok) { status = "rejected"; note = face.reason || "Selfie not accepted. Take a clear photo of your face."; }
    }

    const { error } = await supabaseAdmin.from("verifier_identity").upsert({
      verifier_id: verifier.id,
      nin_hash,
      nin_last4: data.nin.slice(-4),
      id_photo_path: null,
      selfie_path: sfPath,
      status,
      admin_note: note,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "verifier_id" });
    if (error) {
      if (error.message.includes("nin_hash")) throw new Error("This NIN is already linked to another account.");
      throw new Error(error.message);
    }
    if (sharedDevice) {
      await supabaseAdmin.from("verifiers").update({ is_active: false }).eq("id", verifier.id);
    }
    return { status, note };
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
        r.id_photo_path ? supabaseAdmin.storage.from("verifier-kyc").createSignedUrl(r.id_photo_path, 3600) : Promise.resolve({ data: null }),
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
        id_photo_url: (a as any).data?.signedUrl ?? null,
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
