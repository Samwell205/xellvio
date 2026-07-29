import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_campaigns",
  title: "List campaigns",
  description: "List the signed-in user's SMS campaigns, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many campaigns to return (default 20)."),
    status: z.string().optional().describe("Optional status filter, e.g. draft, sending, completed."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    let q = supabaseForUser(ctx)
      .from("campaigns")
      .select("id,name,status,send_mode,schedule_at,track_links,created_at,message_body")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ campaigns: data ?? [] });
  },
});
