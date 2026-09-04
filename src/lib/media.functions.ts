/**
 * Tenant media library. Files live in the private `tenant-media` bucket and are
 * served back to visitors through /api/public/media/<path>, so a published page
 * can show them without ever exposing another tenant's storage listing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MEDIA_BUCKET = "tenant-media";
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export const ALLOWED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export function mediaKindFor(contentType: string): "image" | "video" | "file" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return "file";
}

/** Public delivery path for a stored object. */
export function mediaUrlFor(storagePath: string) {
  return `/api/public/media/${storagePath}`;
}

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

function safeName(name: string) {
  return name.trim().replace(/[^A-Za-z0-9._ -]/g, "").slice(0, 120) || "file";
}

function extensionFor(name: string, contentType: string) {
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase().slice(0, 6) : "";
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return map[contentType] ?? "bin";
}

export const listMediaAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data } = await supabaseAdmin
      .from("media_assets")
      .select("id,name,kind,content_type,size,storage_path,url,created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(400);
    return data ?? [];
  });

/** Step 1 of an upload: reserve a storage path and hand back a signed token. */
export const createMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(3).max(120),
        size: z.number().int().min(1).max(MEDIA_MAX_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!ALLOWED_MEDIA_TYPES.includes(data.contentType as any)) {
      throw new Error("That file type is not supported. Use PNG, JPG, WEBP, GIF, SVG, MP4 or WebM.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const ext = extensionFor(data.name, data.contentType);
    const path = `${accountId}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not start the upload");
    return { path, token: signed.token, bucket: MEDIA_BUCKET };
  });

/** Step 2 of an upload: record the finished file in the tenant's library. */
export const confirmMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().trim().min(3).max(300),
        name: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(3).max(120),
        size: z.number().int().min(0).max(MEDIA_MAX_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    if (!data.path.startsWith(`${accountId}/`)) throw new Error("Upload path does not belong to this workspace");

    const row = {
      account_id: accountId,
      name: safeName(data.name),
      kind: mediaKindFor(data.contentType),
      content_type: data.contentType,
      size: data.size,
      storage_path: data.path,
      url: mediaUrlFor(data.path),
      created_by: context.userId,
    };
    const { data: inserted, error } = await supabaseAdmin.from("media_assets").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const renameMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    await supabaseAdmin
      .from("media_assets")
      .update({ name: safeName(data.name) })
      .eq("id", data.id)
      .eq("account_id", accountId);
    return { ok: true };
  });

export const deleteMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: row } = await supabaseAdmin
      .from("media_assets")
      .select("id,storage_path")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!row) return { ok: true };
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([row.storage_path]);
    await supabaseAdmin.from("media_assets").delete().eq("id", row.id);
    return { ok: true };
  });
