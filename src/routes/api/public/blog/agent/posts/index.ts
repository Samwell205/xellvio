import { createFileRoute } from '@tanstack/react-router';
import { agentJson, agentOptions, agentPostInput, agentSavePost, postLinks, verifyAgent } from '@/lib/blog-agent.server';

export const Route = createFileRoute('/api/public/blog/agent/posts/')({
  server: { handlers: {
    OPTIONS: async () => agentOptions(),
    GET: async ({ request }) => {
      const agent = await verifyAgent(request);
      if (!agent) return agentJson({ error: 'Invalid or revoked publishing key' }, 401);
      const origin = new URL(request.url).origin;
      const { data } = await agent.db.from('content_posts').select('id,title,slug,status,published_at,scheduled_at,updated_at').order('updated_at', { ascending: false }).limit(20);
      return agentJson({ posts: (data ?? []).map(p => ({ ...p, ...postLinks(origin, p) })) });
    },
    POST: async ({ request }) => {
      const agent = await verifyAgent(request);
      if (!agent) return agentJson({ error: 'Invalid or revoked publishing key' }, 401);
      const parsed = agentPostInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return agentJson({ error: 'Invalid article details', issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
      try {
        const row = await agentSavePost(agent, parsed.data);
        return agentJson({ post: { ...row, ...postLinks(new URL(request.url).origin, row) } }, 201);
      } catch (e) { return agentJson({ error: e instanceof Error ? e.message : 'Could not save' }, 422); }
    },
  } },
});
