import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult } from "../supabase";
import { requireBlogAdmin, SITE } from "../blog-admin";
import { agentPostInput, agentSavePost, postLinks } from "@/lib/blog-agent.server";
import { blogPostFields } from "./blog-post-fields";

export default defineTool({
  name: "update_blog_post",
  title: "Update a blog article",
  description: "Edit an existing article; only the fields given change. Set status to draft to take it off the site. Confirm with the user before publishing or unpublishing.",
  inputSchema: { id: z.string().uuid().describe("Article id."), ...blogPostFields },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ id, ...args }, ctx) => {
    const agent = await requireBlogAdmin(ctx);
    try {
      const row = await agentSavePost(agent, agentPostInput.parse(args), id);
      return jsonResult({ post: { id: row.id, title: row.title, status: row.status, ...postLinks(SITE, row) } });
    } catch (e) {
      return errorResult(e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : e instanceof Error ? e.message : "Could not save the article");
    }
  },
});
