import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_contact_lists",
  title: "List contact lists",
  description: "List the signed-in user's audience contact lists.",
  inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("Max lists to return (default 50).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("contact_lists")
      .select("id,name,description,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (error) return errorResult(error.message);
    return jsonResult({ lists: data ?? [] });
  },
});
