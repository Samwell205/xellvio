import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult } from "../supabase";
import { requireBlogAdmin, SITE } from "../blog-admin";
import { postLinks } from "@/lib/blog-agent.server";

export default defineTool({
  name: "list_blog_posts",
  title: "List recent blog articles",
  description: "List the 20 most recently updated blog articles with their status and links (admins only).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_a, ctx) => {
    const { db } = await requireBlogAdmin(ctx);
    const { data, error } = await db.from("content_posts").select("id,title,slug,status,published_at,scheduled_at,updated_at").order("updated_at", { ascending: false }).limit(20);
    if (error) return errorResult("Could not load articles");
    return jsonResult({ posts: (data ?? []).map((p) => ({ id: p.id, title: p.title, status: p.status, published_at: p.published_at, scheduled_at: p.scheduled_at, ...postLinks(SITE, p) })) });
  },
});
