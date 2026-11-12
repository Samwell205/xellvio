import { defineTool } from '@lovable.dev/mcp-js';
import { blogImageInput, decodeBlogImage } from '@/lib/blog-image';
import { storeBlogImageBytes, storeImage } from '@/lib/blog-agent.server';
import { requireBlogAdmin, SITE } from '../blog-admin';
import { errorResult, jsonResult } from '../supabase';

export default defineTool({
  name: 'upload_blog_image',
  title: 'Upload a blog image',
  description: 'Upload an approved PNG, JPEG, WebP, GIF or AVIF image from base64 bytes (including data URLs) or a downloadable HTTPS link, up to 10 MB; returns a permanent URL for featured_image_url or inline Markdown. Private Claude canvas IDs and local file paths are not accessible: export the actual image first. Never invent image bytes.',
  inputSchema: blogImageInput.innerType ? {} : {},
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (args, ctx) => {
    const agent = await requireBlogAdmin(ctx);
    if (typeof agent === 'string') return errorResult(agent);
    try {
      const input = blogImageInput.parse(args);
      if (input.image_base64) {
        const { bytes, type } = decodeBlogImage(input.image_base64, input.content_type);
        const image = await storeBlogImageBytes(agent, bytes, type, input.alt, input.name);
        const url = new URL(image.url, SITE).href;
        return jsonResult({ image: { ...image, url }, markdown: `![${input.alt.replace(/[\[\]\\]/g, '')}](${url})` });
      }
      if (!input.image_url) return errorResult('Provide an image');
      const url = new URL(await storeImage(agent, input.image_url, input.alt, input.name), SITE).href;
      return jsonResult({ image: { url, alt: input.alt }, markdown: `![${input.alt.replace(/[\[\]\\]/g, '')}](${url})` });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'Could not upload the image');
    }
  },
});