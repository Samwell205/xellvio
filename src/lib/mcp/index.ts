import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getAccountSummary from "./tools/get-account-summary";
import listCampaigns from "./tools/list-campaigns";
import getCampaignReport from "./tools/get-campaign-report";
import listContactLists from "./tools/list-contact-lists";
import listInboxReplies from "./tools/list-inbox-replies";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "xellvio-mcp",
  title: "Xellvio",
  version: "0.1.0",
  instructions:
    "Tools for Xellvio, a bulk SMS platform. Callers act as their own Xellvio account: inspect credit balance, campaigns and delivery reports, audience contact lists, and inbound SMS replies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getAccountSummary, listCampaigns, getCampaignReport, listContactLists, listInboxReplies],
});
