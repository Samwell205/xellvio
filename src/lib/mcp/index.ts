import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getAccountSummary from "./tools/get-account-summary";
import listCampaigns from "./tools/list-campaigns";
import getCampaignReport from "./tools/get-campaign-report";
import listContactLists from "./tools/list-contact-lists";
import listInboxReplies from "./tools/list-inbox-replies";
import listBlogCategories from "./tools/blog-list-categories";
import listBlogPosts from "./tools/blog-list-posts";
import getBlogPost from "./tools/blog-get-post";
import createBlogPost from "./tools/blog-create-post";
import updateBlogPost from "./tools/blog-update-post";
import uploadBlogImage from "./tools/blog-upload-image";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "xellvio-mcp",
  title: "Xellvio",
  version: "0.1.0",
  instructions:
    "Tools for Xellvio, a bulk SMS platform. Callers act as their own Xellvio account: inspect credit balance, campaigns and delivery reports, audience contact lists, and inbound SMS replies. Administrators can also write, publish, schedule, edit and unpublish blog articles (content in Markdown); always show the draft and get explicit approval before publishing. Upload approved images with upload_blog_image using actual base64 bytes or a downloadable HTTPS URL, then use its permanent URL as featured_image_url or in inline Markdown. Upload each image separately. Private canvas IDs are not downloadable; never claim access or fabricate bytes. If your environment cannot export the canvas image or send its bytes, ask the user to export/upload it in the blog media library and use that URL. Uploading an image does not publish an article.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getAccountSummary, listCampaigns, getCampaignReport, listContactLists, listInboxReplies, listBlogCategories, listBlogPosts, getBlogPost, createBlogPost, updateBlogPost, uploadBlogImage],
});
