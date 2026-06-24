import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSION_KEYS } from "@/lib/team-permissions";

const roleEnum = z.enum(["viewer", "editor", "admin"]);
const permissionsSchema = z
  .record(z.enum(PERMISSION_KEYS), z.boolean())
  .optional()
  .default({});

export const listMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Owner team = members invited to MY account (where account_id == my user id).
    const { data: members, error } = await supabase
      .from("account_members")
      .select("id,account_id,user_id,invited_email,role,status,accepted_at,created_at,invited_by")
      .eq("account_id", userId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Look up display name/email for accepted members.
    const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean) as string[];
    let profiles: Record<string, { email: string | null; full_name: string | null }> = {};
    if (userIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: accts } = await supabaseAdmin
        .from("accounts")
        .select("id,email,full_name")
        .in("id", userIds);
      for (const a of accts ?? []) {
        profiles[a.id] = { email: a.email ?? null, full_name: a.full_name ?? null };
      }
    }
    return (members ?? []).map((m) => ({
      ...m,
      profile: m.user_id ? (profiles[m.user_id] ?? null) : null,
    }));
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().transform((v) => v.trim().toLowerCase()),
        role: roleEnum,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // The inviter is the owner; account_id = userId.
    const { data: existing } = await supabase
      .from("account_members")
      .select("id,status")
      .eq("account_id", userId)
      .ilike("invited_email", data.email)
      .maybeSingle();

    if (existing && existing.status !== "removed") {
      throw new Error("This person has already been invited.");
    }

    let memberId: string;
    if (existing) {
      const { data: upd, error } = await supabase
        .from("account_members")
        .update({
          role: data.role,
          status: "invited",
          invited_by: userId,
          accepted_at: null,
          user_id: null,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      memberId = upd.id;
    } else {
      const { data: ins, error } = await supabase
        .from("account_members")
        .insert({
          account_id: userId,
          invited_email: data.email,
          role: data.role,
          status: "invited",
          invited_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      memberId = ins.id;
    }

    // If the invited email already corresponds to an existing Xellvio user, link immediately.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: matchUser } = await supabaseAdmin
        .from("accounts")
        .select("id,email,full_name")
        .ilike("email", data.email)
        .maybeSingle();
      if (matchUser) {
        await supabaseAdmin
          .from("account_members")
          .update({
            user_id: matchUser.id,
            status: "active",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", memberId);
      }

      // Fetch inviter for the email body
      const { data: inviter } = await supabaseAdmin
        .from("accounts")
        .select("full_name,company,email")
        .eq("id", userId)
        .maybeSingle();

      const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
      const baseUrl = process.env.PUBLIC_BASE_URL ?? "https://xellvio.lovable.app";
      await sendBrandedEmail({
        templateName: "team-invite",
        recipientEmail: data.email,
        idempotencyKey: `team-invite-${memberId}-${Date.now()}`,
        templateData: {
          inviterName: inviter?.full_name || inviter?.company || inviter?.email || "A teammate",
          workspaceName: inviter?.company || inviter?.full_name || "Xellvio workspace",
          role: data.role,
          acceptUrl: `${baseUrl}/auth?invite=${encodeURIComponent(data.email)}`,
        },
      });
    } catch (err) {
      console.warn("[team] invite email failed", err);
    }

    return { id: memberId, ok: true };
  });

export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ memberId: z.string().uuid(), role: roleEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("account_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("account_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("account_members")
      .delete()
      .eq("id", data.memberId)
      .eq("account_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const claimPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_account_invites");
    if (error) throw new Error(error.message);
    return { claimed: data ?? 0 };
  });
