import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult } from "../supabase";
import { requireBlogAdmin } from "../blog-admin";

export default defineTool({
  name: "list_blog_categories",
  title: "List blog categories",
  description: "List the blog's active categories (admins only).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_a, ctx) => {
    const agent = await requireBlogAdmin(ctx);
    if (typeof agent === "string") return errorResult(agent);
    const { db } = agent;
    const { data, error } = await db.from("blog_categories").select("slug,name").eq("archived", false).order("name");
    if (error) return errorResult("Could not load categories");
    return jsonResult({ categories: (data ?? []).map((c) => ({ slug: c.slug, name: c.name })) });
  },
});
