import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult } from "../supabase";
import { requireBlogAdmin, SITE } from "../blog-admin";
import { postLinks } from "@/lib/blog-agent.server";

export default defineTool({
  name: "get_blog_post",
  title: "Get a blog article",
  description: "Read one blog article (HTML body, status, SEO fields) by its id (admins only).",
  inputSchema: { id: z.string().uuid().describe("Article id from list_blog_posts.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const agent = await requireBlogAdmin(ctx);
    if (typeof agent === "string") return errorResult(agent);
    const { db } = agent;
    const { data: p } = await db.from("content_posts").select("id,title,slug,status,excerpt,body,topic,tags,featured_image,image_alt,seo_title,meta_description,cta_label,cta_url,published_at,scheduled_at").eq("id", id).maybeSingle();
    if (!p) return errorResult("Article not found");
    return jsonResult({ post: { id: p.id, title: p.title, slug: p.slug, status: p.status, excerpt: p.excerpt, body_html: p.body, category: p.topic, tags: p.tags ?? [], featured_image: p.featured_image, image_alt: p.image_alt, seo_title: p.seo_title, meta_description: p.meta_description, cta_label: p.cta_label, cta_url: p.cta_url, published_at: p.published_at, scheduled_at: p.scheduled_at, ...postLinks(SITE, p) } });
  },
});
