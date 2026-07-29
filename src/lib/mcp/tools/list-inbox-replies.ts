import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_inbox_replies",
  title: "List inbox replies",
  description: "List recent inbound SMS replies received by the signed-in account.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Max replies to return (default 25)."),
    phone: z.string().optional().describe("Optional E.164 phone number to filter one conversation."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, phone }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    let q = supabaseForUser(ctx)
      .from("sms_thread_messages")
      .select("id,phone_e164,body,direction,status,created_at,from_number,to_number")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (phone) q = q.eq("phone_e164", phone);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ replies: data ?? [] });
  },
});
