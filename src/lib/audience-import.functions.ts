import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ImportJob = {
  id: string;
  file_name: string;
  file_size: number | null;
  total_rows: number;
  processed_rows: number;
  inserted_count: number;
  invalid_count: number;
  duplicate_count: number;
  status: string;
  mapping: any;
  list_id: string | null;
  created_at: string;
};

export type ImportRow = {
  phone_e164: string;
  first_name?: string | null;
  last_name?: string | null;
  country_code?: string | null;
  custom_fields?: Record<string, string>;
};

async function resolveAccount(userId: string) {
  const { resolveActingAccount, assertPermission } = await import("@/lib/acting-account.server");
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  return acting.accountId;
}

/** Create (or reuse) a resumable import job for this file. */
export const startImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    fileName: string;
    fileSize: number;
    totalRows: number;
    listId: string | null;
    mapping: Record<string, unknown>;
  }) => d)
  .handler(async ({ data, context }): Promise<ImportJob> => {
    const accountId = await resolveAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Reuse an unfinished job for the same file so a refresh resumes it.
    const { data: existing } = await admin
      .from("contact_import_jobs")
      .select("*")
      .eq("account_id", accountId)
      .eq("file_name", data.fileName)
      .eq("file_size", data.fileSize)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing as ImportJob;

    const { data: job, error } = await admin
      .from("contact_import_jobs")
      .insert({
        account_id: accountId,
        file_name: data.fileName,
        file_size: data.fileSize,
        total_rows: data.totalRows,
        list_id: data.listId,
        mapping: data.mapping,
        status: "running",
      })
      .select("*")
      .single();
    if (error) throw error;
    return job as ImportJob;
  });

/** Most recent unfinished job for this workspace (used to offer "resume"). */
export const getActiveImportJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportJob | null> => {
    const accountId = await resolveAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("contact_import_jobs")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "running")
      .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as ImportJob) ?? null;
  });

/** Upsert one large batch of contacts in a single database round trip. */
export const importProfilesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    jobId: string;
    listId: string | null;
    rows: ImportRow[];
    /** rows consumed from the file so far, including this batch */
    processedRows: number;
    invalidCount: number;
    duplicateCount: number;
  }) => d)
  .handler(async ({ data, context }): Promise<{ upserted: number }> => {
    const accountId = await resolveAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: job } = await admin
      .from("contact_import_jobs")
      .select("id,account_id,inserted_count")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job || job.account_id !== accountId) throw new Error("Import job not found");

    let upserted = 0;
    if (data.rows.length > 0) {
      const { data: res, error } = await admin.rpc("bulk_import_profiles", {
        _account_id: accountId,
        _list_id: data.listId,
        _rows: data.rows,
      });
      if (error) throw error;
      const row = Array.isArray(res) ? res[0] : res;
      upserted = Number((row?.upserted ?? row) || 0);
    }

    await admin
      .from("contact_import_jobs")
      .update({
        processed_rows: data.processedRows,
        inserted_count: (job.inserted_count ?? 0) + upserted,
        invalid_count: data.invalidCount,
        duplicate_count: data.duplicateCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.jobId);

    return { upserted };
  });

/** Mark a job finished (or cancelled) so it stops being offered for resume. */
export const finishImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; status: "completed" | "cancelled" | "failed" }) => d)
  .handler(async ({ data, context }) => {
    const accountId = await resolveAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("contact_import_jobs")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .eq("account_id", accountId);
    return { ok: true };
  });
