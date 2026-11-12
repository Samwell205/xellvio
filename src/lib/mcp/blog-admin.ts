import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

export const SITE = "https://xellvio.com";

/** Blog tools are admin-only: the role is checked as the signed-in caller before any privileged write. */
export async function requireBlogAdmin(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) return "Not authenticated";
  const { data, error } = await supabaseForUser(ctx).rpc("has_role", { _role: "admin" });
  if (error || data !== true) return "Only Xellvio administrators can manage the blog.";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin, userId: ctx.getUserId()! };
}
