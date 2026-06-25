import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const InputSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(80),
  // Base64-encoded file bytes (no data: prefix). Max ~5MB raw → ~6.7MB b64.
  dataBase64: z.string().min(10).max(7_500_000),
});

function publicBase() {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://xellvio.com"
  ).replace(/\/+$/, "");
}

export const uploadOptInProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ct = data.contentType.toLowerCase();
    if (!ALLOWED_MIME.has(ct)) {
      throw new Error("Unsupported file type. Use PNG, JPG, WEBP, GIF, or PDF.");
    }
    const ext = EXT_BY_MIME[ct] ?? "bin";
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error("File too large. Max 5MB.");
    }
    const key = `${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("opt-in-assets")
      .upload(key, bytes, { contentType: ct, upsert: false });
    if (error) throw new Error(error.message);

    const url = `${publicBase()}/api/public/opt-in-proof/${key}`;
    return { url, path: key };
  });
