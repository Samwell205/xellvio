import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { agentJson, agentOptions, agentPostInput, agentSavePost, postLinks, verifyAgent } from '@/lib/blog-agent.server';

export const Route = createFileRoute('/api/public/blog/agent/posts/$id')({
  server: { handlers: {
    OPTIONS: async () => agentOptions(),
    GET: async ({ request, params }) => {
      const agent = await verifyAgent(request);
      if (!agent) return agentJson({ error: 'Invalid or revoked publishing key' }, 401);
      if (!z.string().uuid().safeParse(params.id).success) return agentJson({ error: 'Article not found' }, 404);
      const { data } = await agent.db.from('content_posts').select('id,title,slug,status,excerpt,body,topic,tags,featured_image,image_alt,seo_title,meta_description,published_at,scheduled_at').eq('id', params.id).maybeSingle();
      if (!data) return agentJson({ error: 'Article not found' }, 404);
      return agentJson({ post: { ...data, ...postLinks(new URL(request.url).origin, data) } });
    },
    PATCH: async ({ request, params }) => {
      const agent = await verifyAgent(request);
      if (!agent) return agentJson({ error: 'Invalid or revoked publishing key' }, 401);
      if (!z.string().uuid().safeParse(params.id).success) return agentJson({ error: 'Article not found' }, 404);
      const parsed = agentPostInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return agentJson({ error: 'Invalid article details', issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
      try {
        const row = await agentSavePost(agent, parsed.data, params.id);
        return agentJson({ post: { ...row, ...postLinks(new URL(request.url).origin, row) } });
      } catch (e) { return agentJson({ error: e instanceof Error ? e.message : 'Could not save' }, 422); }
    },
  } },
});
