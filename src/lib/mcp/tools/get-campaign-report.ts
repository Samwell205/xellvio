import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_campaign_report",
  title: "Get campaign report",
  description: "Delivery breakdown for one campaign: counts by status, spend, segments and MMS usage.",
  inputSchema: { campaignId: z.string().uuid().describe("The campaign id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaignId }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);

    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id,name,status,created_at")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr) return errorResult(campErr.message);
    if (!campaign) return errorResult("Campaign not found (or not yours).");

    const byStatus: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    let total = 0;
    let spend = 0;
    let mms = 0;
    let segments = 0;

    const pageSize = 1000;
    for (let from = 0; from < 50_000; from += pageSize) {
      const { data, error } = await supabase
        .from("messages")
        .select("status,cost,is_mms,segments_count,country_code")
        .eq("campaign_id", campaignId)
        .range(from, from + pageSize - 1);
      if (error) return errorResult(error.message);
      if (!data?.length) break;
      for (const m of data) {
        total += 1;
        byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
        if (m.country_code) byCountry[m.country_code] = (byCountry[m.country_code] ?? 0) + 1;
        spend += Number(m.cost ?? 0);
        if (m.is_mms) mms += 1;
        segments += m.segments_count ?? 1;
      }
      if (data.length < pageSize) break;
    }

    return jsonResult({
      campaign,
      totals: { messages: total, segments, mms, spend: Number(spend.toFixed(4)) },
      byStatus,
      byCountry,
    });
  },
});
