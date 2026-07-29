import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_account_summary",
  title: "Get account summary",
  description: "Get the signed-in Xellvio account: company, credit balance and sending status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("accounts")
      .select("id,email,full_name,company,credit_balance,onboarding_status,sending_suspended_at,sending_suspended_reason")
      .eq("id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("No account found for this user.");
    return jsonResult(data);
  },
});
