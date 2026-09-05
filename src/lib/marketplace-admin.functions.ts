// Marketplace admin panel: review queue, publishing controls, ecosystem metrics.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminCtx(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _role: "admin" } as never);
  // has_role() reads auth.uid(); with the service role that is null, so verify by table.
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow && isAdmin !== true) throw new Error("Forbidden");
  return supabaseAdmin;
}

export const adminListMarketplaceApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await adminCtx(context.userId);
    const { data: apps } = await sb
      .from("apps")
      .select(
        "id, name, slug, status, visibility, auth_type, version, install_count, rating, submitted_at, review_notes, created_at, app_categories ( name ), developers ( company_name, verification_status, is_first_party )",
      )
      .order("created_at", { ascending: false });

    const [{ count: installCount }, { count: connCount }, { data: errorLogs }] = await Promise.all([
      sb.from("app_installations").select("id", { count: "exact", head: true }).eq("status", "installed"),
      sb.from("app_connections").select("id", { count: "exact", head: true }),
      sb
        .from("integration_logs")
        .select("id, action, event_type, status, error_message, created_at, apps ( name )")
        .neq("status", "ok")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    return {
      apps: (apps ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
        visibility: a.visibility,
        authType: a.auth_type,
        version: a.version,
        installCount: a.install_count,
        rating: a.rating,
        submittedAt: a.submitted_at,
        reviewNotes: a.review_notes,
        categoryName: a.app_categories?.name ?? null,
        developerName: a.developers?.company_name ?? "—",
        developerVerified: a.developers?.verification_status === "verified",
        firstParty: a.developers?.is_first_party === true,
      })),
      metrics: {
        totalInstalls: installCount ?? 0,
        totalConnections: connCount ?? 0,
      },
      errors: (errorLogs ?? []).map((r: any) => ({
        id: r.id,
        appName: r.apps?.name ?? "—",
        action: r.action,
        eventType: r.event_type,
        status: r.status,
        error: r.error_message,
        createdAt: r.created_at,
      })),
    };
  });

export const adminReviewApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        appId: z.string().uuid(),
        decision: z.enum(["approve", "publish", "reject", "request_changes", "suspend", "unpublish"]),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminCtx(context.userId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { review_notes: data.notes || null };
    switch (data.decision) {
      case "approve":
        patch["status"] = "approved";
        break;
      case "publish":
        patch["status"] = "published";
        patch["visibility"] = "public";
        patch["published_at"] = now;
        break;
      case "reject":
        patch["status"] = "rejected";
        break;
      case "request_changes":
        patch["status"] = "draft";
        break;
      case "suspend":
        patch["status"] = "suspended";
        patch["visibility"] = "private";
        break;
      case "unpublish":
        patch["status"] = "approved";
        patch["visibility"] = "private";
        break;
    }
    const { error } = await sb.from("apps").update(patch as never).eq("id", data.appId);
    if (error) throw new Error(error.message);
    await sb.from("integration_logs").insert({
      app_id: data.appId,
      event_type: "review",
      action: data.decision,
      status: "ok",
      request_data: { notes: data.notes ?? null } as never,
    });
    return { ok: true };
  });

export const adminSetDeveloperStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        developerId: z.string().uuid(),
        verificationStatus: z.enum(["unverified", "pending", "verified"]).optional(),
        developerStatus: z.enum(["active", "suspended"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminCtx(context.userId);
    const { error } = await sb
      .from("developers")
      .update({
        ...(data.verificationStatus ? { verification_status: data.verificationStatus } : {}),
        ...(data.developerStatus ? { developer_status: data.developerStatus } : {}),
      })
      .eq("id", data.developerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListDevelopers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await adminCtx(context.userId);
    const { data } = await sb
      .from("developers")
      .select("id, company_name, website, verification_status, developer_status, is_first_party, created_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });
