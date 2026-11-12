import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult } from "../supabase";
import { requireBlogAdmin, SITE } from "../blog-admin";
import { agentPostInput, agentSavePost, postLinks } from "@/lib/blog-agent.server";
import { blogPostFields } from "./blog-post-fields";

export default defineTool({
  name: "create_blog_post",
  title: "Create a blog article",
  description: "Save a new blog article as a draft, publish it live, or schedule it. Only publish or schedule after the user explicitly approves the final draft.",
  inputSchema: blogPostFields,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (args, ctx) => {
    const agent = await requireBlogAdmin(ctx);
    try {
      const row = await agentSavePost(agent, agentPostInput.parse(args));
      return jsonResult({ post: { id: row.id, title: row.title, status: row.status, ...postLinks(SITE, row) } });
    } catch (e) {
      return errorResult(e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : e instanceof Error ? e.message : "Could not save the article");
    }
  },
});
